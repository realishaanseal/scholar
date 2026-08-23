/**
 * End-to-end smoke test against a real Postgres instance. Not a unit test
 * suite — a single adversarial run through the layers most likely to have
 * broken in the SQLite -> Postgres port: schema creation, placeholder
 * translation, aggregate casts, the transaction shim, and cross-cutting
 * account deletion.
 */
import assert from "node:assert/strict";
import { db, newId } from "../src/lib/db";
import {
  createHomework, listHomework, getHomework, updateHomework, deleteHomework,
  listSubjects, ensureSubject, createUserWithPassword, findUserByEmail,
  createPendingAttachment, linkAttachments, listAttachments, getAttachmentFile, deleteAttachment,
} from "../src/lib/queries";
import { paceBySubject, getAvailability, setAvailability, memorySnapshot, resetMemory } from "../src/lib/scholar/memory";
import { buildAnalytics } from "../src/lib/scholar/analytics";
import { getLanguages, setLanguages } from "../src/lib/scholar/language";
import { getNotifyPrefs, setNotifyPrefs, dismissSignal, dismissedKeys, clearDismissals } from "../src/lib/scholar/notifications";
import { buildSnapshot } from "../src/lib/scholar/snapshot";
import {
  createGroup, joinGroupByCode, listGroups, getGroupForUser, createGroupTask,
  addComment, listComments, listMembers, requireMembership, AccessDenied,
} from "../src/lib/sharing/store";
import { createGrant, acceptGrant, requireScope } from "../src/lib/sharing/store";
import { workloadSummaryFor } from "../src/lib/sharing/views";
import { getProfile, exportEverything, deleteAccount } from "../src/lib/varaxis/identity";
import { ensureCaptureToken, userIdForToken, rotateCaptureToken } from "../src/lib/captureToken";

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("Schema + basic CRUD");
  const userA = { id: newId(), name: "Alice", email: `alice-${newId()}@test.dev` };
  const userB = { id: newId(), name: "Bob", email: `bob-${newId()}@test.dev` };

  await test("create users directly", async () => {
    await db.prepare(`INSERT INTO users (id, name, email) VALUES (?, ?, ?)`).run(userA.id, userA.name, userA.email);
    await db.prepare(`INSERT INTO users (id, name, email) VALUES (?, ?, ?)`).run(userB.id, userB.name, userB.email);
  });

  await test("signup helpers + case-insensitive email lookup", async () => {
    const email = `signup-${newId()}@test.dev`;
    await createUserWithPassword("Sign Up", email, "hash123");
    const found = await findUserByEmail(email.toUpperCase());
    assert.ok(found, "should find user via case-insensitive email");
    assert.equal(found!.email, email.toLowerCase());
  });

  await test("ensureSubject is case-insensitive and idempotent", async () => {
    const s1 = await ensureSubject(userA.id, "Physics");
    const s2 = await ensureSubject(userA.id, "PHYSICS");
    assert.equal(s1.id, s2.id, "should match existing subject case-insensitively");
    const subjects = await listSubjects(userA.id);
    assert.equal(subjects.filter((s) => s.name === "Physics").length, 1);
  });

  let hwId = "";
  await test("createHomework + getHomework + listHomework", async () => {
    const hw = await createHomework({
      userId: userA.id, title: "Lab report", details: "Titration writeup",
      subject: "Chemistry", dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      priority: "high", estimateMins: 90, rawInput: "raw", source: "text",
      aiConfidence: 0.9, aiNotes: "",
    });
    hwId = hw.id;
    assert.equal(hw.subject?.name, "Chemistry");
    const fetched = await getHomework(userA.id, hwId);
    assert.equal(fetched?.title, "Lab report");
    const all = await listHomework(userA.id);
    assert.ok(all.some((h) => h.id === hwId));
  });

  await test("updateHomework completion records a task_event (via recordTaskEvent)", async () => {
    const updated = await updateHomework(userA.id, hwId, { status: "done", actualMins: 75 });
    assert.equal(updated?.status, "done");
    assert.ok(updated?.completedAt);
  });

  await test("paceBySubject aggregate casts are real numbers, not strings", async () => {
    const pace = await paceBySubject(userA.id);
    const chem = pace["Chemistry"];
    assert.ok(chem, "expected a Chemistry pace entry");
    assert.equal(typeof chem.sampleSize, "number");
    assert.equal(typeof chem.calibration, "number");
    assert.equal(typeof chem.averageActualMins, "number");
    assert.ok(!Number.isNaN(chem.calibration));
  });

  await test("buildAnalytics + memorySnapshot read back cleanly", async () => {
    const analytics = await buildAnalytics(userA.id);
    assert.equal(analytics.totalSessions, 1);
    const mem = await memorySnapshot(userA.id);
    assert.equal(mem.totalEvents, 1);
  });

  await test("deleteHomework", async () => {
    const hw2 = await createHomework({
      userId: userA.id, title: "Throwaway", details: "", subject: "General",
      dueAt: null, priority: "normal", estimateMins: null, rawInput: "", source: "text",
      aiConfidence: null, aiNotes: "",
    });
    const ok = await deleteHomework(userA.id, hw2.id);
    assert.equal(ok, true);
    assert.equal(await getHomework(userA.id, hw2.id), null);
  });

  await test("attachments round-trip (base64 in Postgres TEXT column)", async () => {
    const att = await createPendingAttachment(userA.id, "notes.txt", "text/plain", 11, Buffer.from("hello world").toString("base64"));
    await linkAttachments(userA.id, hwId, [att.id]);
    const list = await listAttachments(userA.id, hwId);
    assert.equal(list.length, 1);
    const file = await getAttachmentFile(userA.id, att.id);
    assert.equal(Buffer.from(file!.data, "base64").toString(), "hello world");
    assert.equal(await deleteAttachment(userA.id, att.id), true);
  });

  await test("availability defaults + setAvailability upsert (ON CONFLICT ... excluded)", async () => {
    const before = await getAvailability(userB.id);
    assert.equal(before.weekdayMins, 120, "should be the schema default");
    const after = await setAvailability(userB.id, { weekdayMins: 45 });
    assert.equal(after.weekdayMins, 45);
    const reread = await getAvailability(userB.id);
    assert.equal(reread.weekdayMins, 45);
  });

  await test("languages upsert independently of availability (shared academic_profile row)", async () => {
    await setLanguages(userB.id, { responseLanguage: "hi" });
    const langs = await getLanguages(userB.id);
    assert.equal(langs.responseLanguage, "hi");
    // The earlier availability write must still be intact (no column clobbering).
    const avail = await getAvailability(userB.id);
    assert.equal(avail.weekdayMins, 45);
  });

  await test("notify prefs + dismissed signals (composite PK ON CONFLICT DO NOTHING)", async () => {
    await setNotifyPrefs(userB.id, { "overdue-pileup": false });
    const prefs = await getNotifyPrefs(userB.id);
    assert.equal(prefs["overdue-pileup"], false);
    await dismissSignal(userB.id, "sig-1");
    await dismissSignal(userB.id, "sig-1"); // duplicate dismiss must not throw
    const dismissed = await dismissedKeys(userB.id);
    assert.ok(dismissed.has("sig-1"));
    const cleared = await clearDismissals(userB.id);
    assert.equal(cleared, 1);
  });

  await test("capture token round-trip + constant-time lookup", async () => {
    const token = await ensureCaptureToken(userA.id);
    assert.ok(token.startsWith("vxs_"));
    const resolved = await userIdForToken(token);
    assert.equal(resolved, userA.id);
    const rotated = await rotateCaptureToken(userA.id);
    assert.notEqual(rotated, token);
    assert.equal(await userIdForToken(token), null, "old token must stop working after rotation");
  });

  await test("buildSnapshot assembles without throwing", async () => {
    const snap = await buildSnapshot(userA.id);
    assert.ok(snap.tasks.length >= 1);
  });

  console.log("\nGroups + sharing (Tier 4)");

  let groupId = "";
  await test("createGroup + join code + joinGroupByCode", async () => {
    const group = await createGroup(userA.id, { name: "Physics revision", kind: "study-group" });
    groupId = group.id;
    assert.equal(group.role, "owner");
    assert.equal(group.memberCount, 1);
    assert.equal(typeof group.memberCount, "number", "memberCount subquery cast must be numeric");

    const joined = await joinGroupByCode(userB.id, group.joinCode!);
    assert.equal(joined.id, groupId);
    assert.equal(joined.role, "member");

    const listedForB = await listGroups(userB.id);
    assert.ok(listedForB.some((g) => g.id === groupId));

    const withCount = await getGroupForUser(userA.id, groupId);
    assert.equal(withCount?.memberCount, 2, "member count should reflect both members");
  });

  await test("group task + comment", async () => {
    const task = await createGroupTask(groupId, userB.id, { title: "Read ch. 4" });
    await addComment(groupId, userA.id, "sounds good", task.id);
    const comments = await listComments(groupId, userB.id, task.id);
    assert.equal(comments.length, 1);
    const members = await listMembers(groupId, userA.id);
    assert.equal(members.length, 2);
  });

  await test("requireMembership throws AccessDenied for a non-member", async () => {
    const outsider = newId();
    await assert.rejects(() => requireMembership(groupId, outsider), AccessDenied);
  });

  await test("share grant: create, accept, requireScope, workloadSummaryFor", async () => {
    const grant = await createGrant(userA.id, { scopes: ["workload-summary"], label: "For Bob" });
    const accepted = await acceptGrant(userB.id, grant.inviteCode!);
    assert.equal(accepted.viewerUserId, userB.id);

    const subjectId = await requireScope(userB.id, accepted.id, "workload-summary");
    assert.equal(subjectId, userA.id);

    const summary = await workloadSummaryFor(userB.id, accepted.id);
    assert.equal(summary.scope, "workload-summary");
    assert.equal(typeof summary.openCount, "number");
  });

  await test("db.transaction() actually commits atomically (via deleteAccount)", async () => {
    const victim = { id: newId(), name: "Doomed", email: `doomed-${newId()}@test.dev` };
    await db.prepare(`INSERT INTO users (id, name, email) VALUES (?, ?, ?)`).run(victim.id, victim.name, victim.email);
    const g = await createGroup(victim.id, { name: "Owned by doomed" });
    await createHomework({
      userId: victim.id, title: "x", details: "", subject: "General", dueAt: null,
      priority: "normal", estimateMins: null, rawInput: "", source: "text", aiConfidence: null, aiNotes: "",
    });

    await deleteAccount(victim.id);

    const profile = await getProfile(victim.id);
    assert.equal(profile, null, "user row should be gone (cascade)");
    const groupGone = await db.prepare(`SELECT id FROM groups WHERE id = ?`).get(g.id);
    assert.equal(groupGone, undefined, "owned group should be deleted by the transaction");
  });

  await test("exportEverything excludes secrets and includes sharing data", async () => {
    const dump = await exportEverything(userA.id);
    assert.ok(dump.homework.length >= 1);
    assert.ok(!("apiKeyCipher" in (dump.aiSettings ?? {})));
    assert.ok(dump.sharing.groupsOwned.some((g: any) => g.id === groupId));
  });

  console.log(`\n${passed} passed`);
  if (process.exitCode) {
    console.error("SOME TESTS FAILED");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
