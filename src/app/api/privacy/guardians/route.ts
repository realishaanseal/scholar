import { NextResponse } from "next/server";
import { personalRoute } from "@/lib/api/guard";
import { guardiansOf } from "@/domains/guardians";

export const runtime = "nodejs";

/**
 * Who is receiving reports about you.
 *
 * A personal route, and readable by the student themselves without anybody's
 * permission. Somebody is entitled to know who is reading about them, and a
 * system that hides that from a seventeen-year-old has decided their privacy
 * belongs to somebody else.
 *
 * It also names the member of staff who asserted each link, because a student
 * who believes one is wrong needs to know who to ask.
 */
export const GET = personalRoute(async ({ userId }) =>
  NextResponse.json({ guardians: await guardiansOf(userId) })
);
