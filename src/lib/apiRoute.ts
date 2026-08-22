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
        : message;

      return NextResponse.json({ ok: false, error: friendly }, { status: 500 });
    }
  };
}
