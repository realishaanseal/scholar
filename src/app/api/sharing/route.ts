import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { guarded } from "@/lib/apiAuth";
import {
  acceptGrant, createGrant, listGrantsIssued, listGrantsReceived, revokeGrant,
} from "@/lib/sharing/store";
import { subjectDisplayName } from "@/lib/sharing/views";
import { SHARE_SCOPES } from "@/lib/sharing/model";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const [issued, receivedRaw] = await Promise.all([
    listGrantsIssued(userId),
    listGrantsReceived(userId),
  ]);
  const received = await Promise.all(
    receivedRaw.map(async (g) => ({ ...g, subjectName: await subjectDisplayName(g.subjectUserId) }))
  );

  return NextResponse.json({
    // What this user has shared out, and what's been shared with them.
    issued,
    received,
    availableScopes: SHARE_SCOPES,
  });
});

const ScopeEnum = z.enum(["workload-summary", "upcoming-deadlines", "progress-stats"]);

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    scopes: z.array(ScopeEnum).min(1).max(3),
    label: z.string().trim().min(1).max(60),
    /** Days until it lapses. Null means no automatic expiry. */
    expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  }),
  z.object({ action: z.literal("accept"), code: z.string().trim().min(4).max(16) }),
]);

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const userId = session.user.id;

  return guarded(async () => {
    if (parsed.data.action === "create") {
      const expiresAt = parsed.data.expiresInDays
        ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString()
        : null;

      return NextResponse.json(
        {
          grant: await createGrant(userId, {
            scopes: parsed.data.scopes,
            label: parsed.data.label,
            expiresAt,
          }),
        },
        { status: 201 }
      );
    }

    const grant = await acceptGrant(userId, parsed.data.code);
    return NextResponse.json({
      grant: { ...grant, subjectName: await subjectDisplayName(grant.subjectUserId) },
    });
  });
});

export const DELETE = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing grant id." }, { status: 400 });

  // Only the subject can revoke; the store enforces that in its WHERE clause.
  return NextResponse.json({ ok: await revokeGrant(session.user.id, id) });
});
