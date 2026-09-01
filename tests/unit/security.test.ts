import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, hintFor } from "@/lib/crypto";
import {
  isGrantActive, canParticipate, canDistribute, canAdminister,
  type ShareGrant,
} from "@/lib/sharing/model";

/*
  Two modules where a regression is a security incident rather than a bug:
  the at-rest encryption for provider API keys, and the predicates that decide
  who may read or write shared data. Both are pure, so both are pinned here.
*/

beforeAll(() => {
  // The real secret never leaves the deployment; any stable value exercises
  // the same scrypt derivation.
  process.env.AUTH_SECRET = "test-secret-for-unit-tests-only-0000000000";
});

describe("secret encryption", () => {
  it("round-trips a key", () => {
    const key = "sk-test-abcdef0123456789";
    expect(decryptSecret(encryptSecret(key))).toBe(key);
  });

  it("never emits the plaintext in the stored payload", () => {
    const key = "sk-test-abcdef0123456789";
    const payload = encryptSecret(key);
    expect(payload).not.toContain(key);
    expect(payload.startsWith("v1.")).toBe(true);
  });

  it("produces a different ciphertext each time", () => {
    // A fresh IV per call, so identical keys must not encrypt identically —
    // otherwise the database leaks which users share a provider key.
    const key = "sk-test-abcdef0123456789";
    expect(encryptSecret(key)).not.toBe(encryptSecret(key));
  });

  it("refuses tampered ciphertext instead of returning garbage", () => {
    const payload = encryptSecret("sk-test-abcdef0123456789");
    const [v, iv, tag, data] = payload.split(".");
    const flipped = data[0] === "A" ? "B" : "A";
    expect(decryptSecret([v, iv, tag, flipped + data.slice(1)].join("."))).toBeNull();
  });

  it("refuses a payload from an unknown format version", () => {
    const payload = encryptSecret("sk-test-abcdef0123456789");
    expect(decryptSecret(payload.replace(/^v1\./, "v2."))).toBeNull();
  });

  it("returns null rather than throwing on malformed input", () => {
    // Callers treat null as "no key configured"; a throw here would take down
    // an unrelated request.
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret("garbage")).toBeNull();
  });
});

describe("key hint", () => {
  it("shows only the ends of a real key", () => {
    const hint = hintFor("sk-proj-ABCDEFGHIJKLMNOP");
    expect(hint).toBe("sk-p…MNOP");
    expect(hint).not.toContain("EFGHIJKL");
  });

  it("reveals nothing at all for a short value", () => {
    expect(hintFor("short")).toMatch(/^•+$/);
  });
});

describe("share grants", () => {
  const base: ShareGrant = {
    id: "g1",
    subjectUserId: "student",
    viewerUserId: "parent",
    inviteCode: null,
    scopes: ["workload-summary"],
    label: "Mum",
    createdAt: new Date(2026, 0, 1).toISOString(),
    expiresAt: null,
    revokedAt: null,
  };
  const NOW = new Date(2026, 8, 1, 12, 0, 0);

  it("is active when neither revoked nor expired", () => {
    expect(isGrantActive(base, NOW)).toBe(true);
  });

  it("stops immediately on revocation, with no grace period", () => {
    expect(isGrantActive({ ...base, revokedAt: NOW.toISOString() }, NOW)).toBe(false);
  });

  it("stops at expiry", () => {
    const expired = { ...base, expiresAt: new Date(2026, 7, 1).toISOString() };
    expect(isGrantActive(expired, NOW)).toBe(false);
  });

  it("treats revocation as final even when an expiry is still in the future", () => {
    const both = {
      ...base,
      expiresAt: new Date(2027, 0, 1).toISOString(),
      revokedAt: NOW.toISOString(),
    };
    expect(isGrantActive(both, NOW)).toBe(false);
  });
});

describe("group role predicates", () => {
  it("never lets an observer write", () => {
    // An observer is a parent looking in. Read-only is the whole point.
    expect(canParticipate("observer")).toBe(false);
    expect(canDistribute("observer")).toBe(false);
    expect(canAdminister("observer")).toBe(false);
  });

  it("lets members take part but not administer or distribute", () => {
    expect(canParticipate("member")).toBe(true);
    expect(canDistribute("member")).toBe(false);
    expect(canAdminister("member")).toBe(false);
  });

  it("gives owners and teachers the administrative capabilities", () => {
    for (const role of ["owner", "teacher"] as const) {
      expect(canParticipate(role)).toBe(true);
      expect(canDistribute(role)).toBe(true);
      expect(canAdminister(role)).toBe(true);
    }
  });
});
