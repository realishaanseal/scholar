import { NextResponse } from "next/server";
import { AccessDenied } from "./sharing/store";

/**
 * Turn an AccessDenied into a 403 instead of a 500.
 *
 * The store throws rather than returning null so a forgotten check fails
 * closed; this makes that throw read as a clean refusal at the HTTP layer
 * rather than looking like a server fault.
 */
export function denialToResponse(err: unknown): NextResponse | null {
  if (err instanceof AccessDenied) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return null;
}

/** Wrap a handler body so AccessDenied becomes 403 and everything else rethrows. */
export async function guarded<T>(fn: () => Promise<T> | T): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const denial = denialToResponse(err);
    if (denial) return denial;
    throw err;
  }
}
