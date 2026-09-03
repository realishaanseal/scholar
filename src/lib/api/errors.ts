import { NextResponse } from "next/server";
import { Forbidden } from "@/lib/authz";

/**
 * API error types and the single place a thrown error becomes a response.
 *
 * Split out from guard.ts so this can be tested without pulling in next-auth,
 * which a unit test has no way to stand up.
 */

export class Unauthenticated extends Error {
  constructor() {
    super("Not signed in");
    this.name = "Unauthenticated";
  }
}

/** Raised by a scope resolver when the thing being acted on does not exist. */
export class NotFound extends Error {
  constructor(what = "Not found") {
    super(what);
    this.name = "NotFound";
  }
}

export class BadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequest";
  }
}

/**
 * Map a thrown error to a response.
 *
 * Forbidden and NotFound deliberately produce the same 404 with the same body.
 * A distinct "you are not allowed to see this" on a resource that exists,
 * versus a 404 on one that does not, is an enumeration oracle: it confirms
 * which ids are real to anyone willing to try a few. The real reason is logged
 * server-side, where it is useful and not disclosed.
 */
/**
 * Thrown when a caller has spent their allowance.
 *
 * Here rather than beside the limiter because errorResponse has to know about
 * it, and errors.ts importing the database to learn about one class would put
 * a query engine behind every error path in the application.
 */
export class RateLimited extends Error {
  constructor(readonly resetIn: number) {
    super(
      resetIn > 60
        ? `Too many requests. Try again in about ${Math.ceil(resetIn / 60)} minutes.`
        : `Too many requests. Try again in ${Math.max(1, resetIn)} seconds.`
    );
    this.name = "RateLimited";
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof Unauthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof Forbidden || err instanceof NotFound) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (err instanceof BadRequest) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof RateLimited) {
    // Retry-After is the header a well-behaved client already knows to read,
    // so the limit is legible to something automated as well as to a person.
    return NextResponse.json(
      { error: err.message },
      { status: 429, headers: { "retry-after": String(Math.max(1, err.resetIn)) } }
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error("[api]", message, err);

  return NextResponse.json(
    {
      error: isDriverError(err)
        ? "Something went wrong. Please try again."
        : message,
    },
    { status: 500 }
  );
}

/**
 * Did this come from the database driver rather than from a deliberate throw?
 *
 * node-postgres attaches a five-character SQLSTATE. Those messages name tables,
 * columns and constraints, and can carry the connection string, so they are
 * never shown to a caller.
 */
export function isDriverError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
}
