import { NextResponse } from "next/server";

/**
 * Wraps a route handler so a thrown error always becomes a JSON body.
 *
 * Without this, an unexpected throw produces a 500 with an empty body, and the
 * browser reports "Unexpected end of JSON input" — which tells the user nothing
 * about what actually went wrong.
 */
export function jsonRoute<Args extends any[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err: any) {
      const message: string = err?.message ?? "Something went wrong.";
      console.error("[api]", message, err);

      // A missing table means the database file predates a schema change.
      const friendly = /no such table/i.test(message)
        ? `${message} — restart the dev server so the database picks up the latest schema.`
        : isSafeToShow(err)
          ? message
          : "Something went wrong. Please try again.";

      return NextResponse.json({ ok: false, error: friendly }, { status: 500 });
    }
  };
}

/**
 * Deliberately-thrown app errors (e.g. "Enter an API key for X first") are safe
 * to show verbatim — that's the whole point of throwing them with a friendly
 * message. Raw driver/infrastructure errors (Postgres, network) are not: they
 * can include table/column names or internal details, so those get a generic
 * message instead, with the real one still logged above via console.error.
 */
function isSafeToShow(err: any): boolean {
  if (!err) return false;
  // node-postgres errors carry a `code` (SQLSTATE, e.g. "23505") — that's our
  // signal this came from the driver, not from an explicit `throw new Error(...)`.
  if (typeof err.code === "string" && /^[0-9A-Z]{5}$/.test(err.code)) return false;
  // Anything without a plain Error-shaped message is unknown; don't risk it.
  if (typeof err.message !== "string") return false;
  return true;
}
