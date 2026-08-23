import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import {
  deleteAccount,
  exportEverything,
  getProfile,
  getSignInMethods,
  unlinkProviderAccount,
  updateProfile,
} from "@/lib/varaxis/identity";

export const runtime = "nodejs";

export const GET = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  // ?export=1 returns the full download rather than the profile summary.
  if (new URL(req.url).searchParams.get("export") === "1") {
    const data = await exportEverything(userId);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="varaxis-scholar-export.json"`,
      },
    });
  }

  const [profile, signIn] = await Promise.all([getProfile(userId), getSignInMethods(userId)]);
  return NextResponse.json({ profile, signIn });
});

const UnlinkBody = z.object({ provider: z.enum(["google", "github", "facebook"]) });

/** Unlink one OAuth provider. Separate verb from PATCH's profile-field update
 *  so a client can't accidentally trigger it via the wrong body shape. */
export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = UnlinkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await unlinkProviderAccount(session.user.id, parsed.data.provider);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ ok: true, signIn: await getSignInMethods(session.user.id) });
});

const PatchBody = z.object({ name: z.string().trim().min(1).max(80).optional() });

export const PATCH = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  return NextResponse.json({ profile: await updateProfile(session.user.id, parsed.data) });
});

/**
 * Delete the account.
 *
 * Requires the account's own email typed back as confirmation. This is
 * irreversible and there is no backup to restore from, so a stray DELETE
 * must not be enough on its own.
 */
export const DELETE = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const confirm = String(body?.confirmEmail ?? "").trim().toLowerCase();
  const actual = (session.user.email ?? "").trim().toLowerCase();

  if (!actual || confirm !== actual) {
    return NextResponse.json(
      { error: "Type your email address exactly to confirm deletion." },
      { status: 400 }
    );
  }

  await deleteAccount(session.user.id);
  return NextResponse.json({ ok: true, deleted: true });
});
