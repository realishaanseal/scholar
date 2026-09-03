/**
 * Reading a list without reading all of it.
 *
 * Every list query in this codebase was written against a database with one
 * school, six subjects and thirty-five timetable rows, and returns everything
 * it finds. That is correct and completely fine until an institution with
 * five thousand students opens the people screen, at which point one request
 * loads five thousand rows into memory, serialises them into a payload, and
 * hands the browser a page it cannot render smoothly.
 *
 * Keyset pagination rather than OFFSET. OFFSET makes the database count and
 * discard every row it skips, so page 200 is two hundred times the work of
 * page 1 — and it drops or repeats rows when something is inserted between
 * two requests, which on a roster means a student who quietly does not appear
 * on any page. A cursor is a position rather than a count: it does not drift,
 * and page 200 costs what page 1 costs.
 *
 * The cursor is opaque on purpose. It encodes the sort key of the last row
 * seen, and callers should not construct one — a hand-built cursor is a
 * caller reaching into an implementation detail that will change.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type Page<T> = {
  items: T[];
  /** Pass to the next call. Null when this was the last page. */
  nextCursor: string | null;
  /** True when there is more to fetch. */
  hasMore: boolean;
};

/** Clamp a caller-supplied size into something a server should agree to. */
export function pageSize(requested: number | string | null | undefined): number {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

/**
 * Encode a position.
 *
 * Base64 of the raw key. Not encryption and not pretending to be: the point
 * is that it reads as opaque so nobody builds one by hand, not that its
 * contents are secret. A cursor only ever names a row the caller was already
 * authorised to see.
 */
export function encodeCursor(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): string | null {
  if (!cursor) return null;
  try {
    const out = Buffer.from(cursor, "base64url").toString("utf8");
    if (out.length === 0) return null;

    // Buffer.from does not throw on invalid base64 — it silently discards
    // characters it does not recognise. So a cursor mangled in a URL decodes
    // to plausible-looking garbage, which then reads as a position past every
    // real row and returns an empty page: a list that looks finished when it
    // has not started. Re-encoding and comparing is what actually detects it.
    if (encodeCursor(out) !== cursor) return null;

    return out;
  } catch {
    return null;
  }
}

/**
 * Turn `size + 1` rows into a page of `size`.
 *
 * Fetching one extra row is how "is there more" is answered without a second
 * COUNT query over the whole table — which would cost more than the page
 * itself and be wrong by the time it returned.
 */
export function toPage<T>(
  rows: T[],
  size: number,
  keyOf: (row: T) => string
): Page<T> {
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  return {
    items,
    hasMore,
    nextCursor: hasMore && items.length > 0
      ? encodeCursor(keyOf(items[items.length - 1]))
      : null,
  };
}
