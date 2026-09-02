import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { jsonRoute } from "@/lib/apiRoute";
import { createUserWithPassword, findUserByEmail } from "@/lib/queries";
import { db } from "@/lib/db";
import { ACCOUNT_INTENTS } from "@/lib/accountIntent";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  /**
   * Which door they came through. Recorded, never trusted: roles are granted
   * by an institution, and nothing downstream reads this to decide what
   * anyone may do. If it did, "Teacher" on a signup form would be a
   * privilege-escalation button.
   */
  intent: z.enum(ACCOUNT_INTENTS).optional(),
});

// Postgres SQLSTATE for a unique-constraint violation — thrown by the
// `users.email` UNIQUE index when two signups for the same email race.
const UNIQUE_VIOLATION = "23505";

export const POST = jsonRoute(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid details" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();

  // This existence check is just a fast path for the common case (no wasted
  // bcrypt hash on an obviously-taken email); it is NOT what prevents a
  // duplicate account. Two concurrent signups for the same email can both
  // pass this check, so the real guarantee comes from the `users.email`
  // UNIQUE constraint below, caught explicitly rather than raced against.
  if (await findUserByEmail(email)) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    await createUserWithPassword(parsed.data.name, email, passwordHash);

    // Separate statement rather than a wider createUserWithPassword: that
    // function is shared with OAuth account creation, and this is only ever
    // known when someone chose a door on the signup form.
    if (parsed.data.intent) {
      await db
        .prepare(`UPDATE users SET account_intent = ? WHERE LOWER(email) = LOWER(?)`)
        .run(parsed.data.intent, email);
    }
  } catch (err: any) {
    if (err?.code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
});
