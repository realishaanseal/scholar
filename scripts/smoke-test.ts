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
  upsertExternalHomework, listExternalIds,
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
import { getProfile, exportEverything, deleteAccount, getSignInMethods, unlinkProviderAccount } from "../src/lib/varaxis/identity";
import { ensureCaptureToken, userIdForToken, rotateCaptureToken } from "../src/lib/captureToken";
import { getTheme, setTheme } from "../src/lib/scholar/themeStore";
import { sanitizeAccent, encodeAccent, decodeAccent, DEFAULT_THEME } from "../src/lib/scholar/theme";
import { accentFromHex, accentToHex } from "../src/lib/scholar/themeClient";
import {
  getConnection, saveConnection, disconnect as disconnectCalendar,
  upsertLinkPushed, getLinkByHomeworkId, getLinkByEventId, listLinkedHomeworkIds,
} from "../src/lib/calendar/googleStore";

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

  console.log("\nExternal sync (LMS import / Canvas ICS, Google Calendar) — Tier 5");

  await test("upsertExternalHomework creates once, then updates on the same externalId", async () => {
    const first = await upsertExternalHomework({
      userId: userA.id, externalSource: "lms", externalId: "ics-uid-123",
      title: "Essay draft", details: "v1", subject: "English", dueAt: null,
    });
    assert.equal(first.created, true);

    const second = await upsertExternalHomework({
      userId: userA.id, externalSource: "lms", externalId: "ics-uid-123",
      title: "Essay final draft", details: "v2", subject: "English", dueAt: null,
    });
    assert.equal(second.created, false, "same externalId should update, not duplicate");
    assert.equal(second.homework.id, first.homework.id);
    assert.equal(second.homework.title, "Essay final draft");

    const all = await listHomework(userA.id);
    assert.equal(
      all.filter((h) => h.title.startsWith("Essay")).length, 1,
      "resync must not leave a duplicate row behind"
    );
  });

  await test("upsertExternalHomework never touches status set locally", async () => {
    const created = await upsertExternalHomework({
      userId: userA.id, externalSource: "lms", externalId: "ics-uid-456",
      title: "Lab report", details: "", subject: "Physics", dueAt: null,
    });
    await updateHomework(userA.id, created.homework.id, { status: "done" });

    const resynced = await upsertExternalHomework({
      userId: userA.id, externalSource: "lms", externalId: "ics-uid-456",
      title: "Lab report (updated title)", details: "", subject: "Physics", dueAt: null,
    });
    const row = await getHomework(userA.id, resynced.homework.id);
    assert.equal(row?.status, "done", "resync must not silently reopen a completed task");
  });

  await test("listExternalIds scopes by source, not just by user", async () => {
    await upsertExternalHomework({
      userId: userA.id, externalSource: "google-calendar", externalId: "evt-1",
      title: "From Google", details: "", subject: "General", dueAt: null,
    });
    const lmsIds = await listExternalIds(userA.id, "lms");
    const gcalIds = await listExternalIds(userA.id, "google-calendar");
    assert.ok(lmsIds.has("ics-uid-123"));
    assert.ok(!lmsIds.has("evt-1"), "a google-calendar externalId must not leak into the lms set");
    assert.ok(gcalIds.has("evt-1"));
  });

  console.log("\nAccount linking (Sign-in methods panel) — Tier 6");

  const emailPassUser = { id: newId(), name: "Email Pass", email: `emailpass-${newId()}@test.dev` };
  await db.prepare(`INSERT INTO users (id, name, email, passwordHash) VALUES (?, ?, ?, ?)`)
    .run(emailPassUser.id, emailPassUser.name, emailPassUser.email, "hash123");

  await test("getSignInMethods reports password + zero OAuth providers for a plain signup", async () => {
    const methods = await getSignInMethods(emailPassUser.id);
    assert.equal(methods.hasPassword, true);
    assert.equal(methods.oauth.length, 0);
  });

  await test("unlinkProviderAccount refuses to remove the only sign-in method", async () => {
    // emailPassUser has a password and no linked OAuth account — there is
    // nothing to unlink (also exercises the "not even linked" branch).
    const result = await unlinkProviderAccount(emailPassUser.id, "google");
    assert.equal(result.ok, false);
  });

  await test("unlinkProviderAccount succeeds when another method remains", async () => {
    await db.prepare(
      `INSERT INTO accounts (id, userId, type, provider, providerAccountId) VALUES (?, ?, 'oauth', 'google', ?)`
    ).run(newId(), emailPassUser.id, `google-sub-${newId()}`);

    const result = await unlinkProviderAccount(emailPassUser.id, "google");
    assert.equal(result.ok, true);
    const methods = await getSignInMethods(emailPassUser.id);
    assert.equal(methods.oauth.length, 0);
  });

  await test("unlinkProviderAccount refuses the last method even with no password", async () => {
    const oauthOnly = { id: newId(), name: "OAuth Only", email: `oauth-${newId()}@test.dev` };
    await db.prepare(`INSERT INTO users (id, name, email) VALUES (?, ?, ?)`).run(oauthOnly.id, oauthOnly.name, oauthOnly.email);
    await db.prepare(
      `INSERT INTO accounts (id, userId, type, provider, providerAccountId) VALUES (?, ?, 'oauth', 'github', ?)`
    ).run(newId(), oauthOnly.id, `gh-sub-${newId()}`);

    const result = await unlinkProviderAccount(oauthOnly.id, "github");
    assert.equal(result.ok, false, "no password + this is the only provider => must refuse");
  });

  console.log("\nAppearance theme — Tier 7");

  await test("theme round-trips through Postgres and survives sanitize/encode/decode", async () => {
    const chosen = sanitizeAccent({ h: 260, h2: 40, s: 70, l: 45 });
    await setTheme(userA.id, chosen);
    const loaded = await getTheme(userA.id);
    assert.deepEqual(loaded, chosen);

    const encoded = encodeAccent(chosen);
    assert.deepEqual(decodeAccent(encoded), chosen);
  });

  await test("getTheme falls back to the default for a user who never set one", async () => {
    const fresh = { id: newId(), name: "Fresh", email: `fresh-${newId()}@test.dev` };
    await db.prepare(`INSERT INTO users (id, name, email) VALUES (?, ?, ?)`).run(fresh.id, fresh.name, fresh.email);
    assert.deepEqual(await getTheme(fresh.id), DEFAULT_THEME);
  });

  await test("hex <-> HSL accent conversion round-trips for the default and a custom color", async () => {
    for (const accent of [DEFAULT_THEME, sanitizeAccent({ h: 15, h2: 200, s: 60, l: 50 })]) {
      const hex = accentToHex(accent);
      // No `base` passed: this reconstructs h/s/l purely from the hex, so it
      // actually exercises the hslToHex -> hexToHsl round trip rather than
      // inheriting s/l from the caller (which is what passing a base does,
      // by design, for the live picker's "only hue changed" case).
      const back = accentFromHex(hex);
      assert.ok(Math.abs(back.h - accent.h) <= 2, `hue drifted too far: ${back.h} vs ${accent.h}`);
      assert.ok(Math.abs(back.s - accent.s) <= 2, `saturation drifted too far: ${back.s} vs ${accent.s}`);
      assert.ok(Math.abs(back.l - accent.l) <= 2, `lightness drifted too far: ${back.l} vs ${accent.l}`);
    }
  });

  console.log("\nGoogle Calendar connection + link store — Tier 8");

  await test("calendar connection round-trips encrypted tokens and reports connected", async () => {
    assert.equal(await getConnection(userA.id), null);

    await saveConnection(userA.id, {
      accessToken: "fake-access-token", refreshToken: "fake-refresh-token",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(), scope: "https://www.googleapis.com/auth/calendar.events",
    });

    const conn = await getConnection(userA.id);
    assert.ok(conn, "connection should now exist");
    assert.equal(conn!.calendarId, "primary");
  });

  await test("calendar_links enforces one link per (user, homework) and per (user, event)", async () => {
    const hw = await createHomework({
      userId: userA.id, title: "Linked to Google", details: "", subject: "General", dueAt: null,
      priority: "normal", estimateMins: null, rawInput: "", source: "text", aiConfidence: null, aiNotes: "",
    });

    await upsertLinkPushed(userA.id, hw.id, "google-event-abc");
    const byHomework = await getLinkByHomeworkId(userA.id, hw.id);
    const byEvent = await getLinkByEventId(userA.id, "google-event-abc");
    assert.equal(byHomework?.externalEventId, "google-event-abc");
    assert.equal(byEvent?.homeworkId, hw.id);

    // Re-pushing the same task with a new event id should update the existing
    // link row (ON CONFLICT), not create a second one.
    await upsertLinkPushed(userA.id, hw.id, "google-event-xyz");
    const linked = await listLinkedHomeworkIds(userA.id);
    assert.ok(linked.has(hw.id));
    assert.equal((await getLinkByEventId(userA.id, "google-event-abc")), null, "stale event id must no longer resolve");
  });

  await test("disconnect clears both the connection and its links", async () => {
    await disconnectCalendar(userA.id);
    assert.equal(await getConnection(userA.id), null);
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
