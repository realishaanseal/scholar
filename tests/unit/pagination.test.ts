import { describe, it, expect } from "vitest";
import {
  decodeCursor, encodeCursor, MAX_PAGE_SIZE, pageSize, toPage,
} from "@/lib/pagination";

/*
  Paging is the sort of thing that looks obviously right and hides a list that
  silently stops early. These are the cases where that happens.
*/

describe("cursors survive a round trip, and nothing else does", () => {
  it("round-trips a key", () => {
    expect(decodeCursor(encodeCursor("someone@school.edu"))).toBe("someone@school.edu");
  });

  it("round-trips a key with characters a URL would mangle", () => {
    const key = "a+b/c=d é 名前";
    expect(decodeCursor(encodeCursor(key))).toBe(key);
  });

  it("rejects a corrupted cursor rather than paging past everything", () => {
    // The bug this test exists for: Buffer.from does not throw on invalid
    // base64, it silently drops the bad characters. The garbage that comes
    // out reads as a position after every real row, so the caller gets an
    // empty page and believes the list has ended.
    expect(decodeCursor("!!!not-base64!!!")).toBeNull();
    expect(decodeCursor("§§§")).toBeNull();
  });

  it("treats an absent cursor as the beginning", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
});

describe("page size is the server's decision", () => {
  it("uses a sensible default when asked for nothing", () => {
    expect(pageSize(undefined)).toBeGreaterThan(0);
    expect(pageSize(null)).toBeGreaterThan(0);
    expect(pageSize("nonsense")).toBeGreaterThan(0);
  });

  it("refuses to fetch the whole table because a caller asked", () => {
    expect(pageSize(100000)).toBe(MAX_PAGE_SIZE);
    expect(pageSize(-5)).toBeGreaterThan(0);
    expect(pageSize(0)).toBeGreaterThan(0);
  });

  it("honours a reasonable request", () => {
    expect(pageSize(25)).toBe(25);
    expect(pageSize("25")).toBe(25);
  });
});

describe("turning rows into a page", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}` }));

  it("knows there is more when handed the extra row", () => {
    // Fetching size + 1 is how "is there more" is answered without a second
    // COUNT over the whole table.
    const p = toPage(rows(11), 10, (r) => r.id);
    expect(p.items).toHaveLength(10);
    expect(p.hasMore).toBe(true);
    expect(p.nextCursor).not.toBeNull();
  });

  it("knows it is the last page", () => {
    const p = toPage(rows(7), 10, (r) => r.id);
    expect(p.items).toHaveLength(7);
    expect(p.hasMore).toBe(false);
    expect(p.nextCursor).toBeNull();
  });

  it("points the cursor at the last row returned, not the extra one", () => {
    // Off by one here repeats a row on every page boundary.
    const p = toPage(rows(11), 10, (r) => r.id);
    expect(decodeCursor(p.nextCursor)).toBe("k9");
  });

  it("survives an empty result", () => {
    const p = toPage([], 10, (r: { id: string }) => r.id);
    expect(p.items).toEqual([]);
    expect(p.hasMore).toBe(false);
    expect(p.nextCursor).toBeNull();
  });
});
