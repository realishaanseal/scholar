import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { buildSnapshot } from "@/lib/scholar/snapshot";
import {
  clearDismissals, dismissSignal, getNotifyPrefs, setNotifyPrefs,
} from "@/lib/scholar/notifications";

export const runtime = "nodejs";

export const GET = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nowParam = new URL(req.url).searchParams.get("now");
  const parsed = nowParam ? new Date(nowParam) : new Date();
  const now = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const [snapshot, prefs] = await Promise.all([
    buildSnapshot(session.user.id, { now }),
    getNotifyPrefs(session.user.id),
  ]);

  return NextResponse.json({
    signals: snapshot.signals,
    prefs,
  });
});

const PatchBody = z.object({
  dismiss: z.string().max(200).optional(),
  clearDismissed: z.boolean().optional(),
  prefs: z.record(z.string(), z.boolean()).optional(),
});

export const PATCH = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (parsed.data.dismiss) await dismissSignal(session.user.id, parsed.data.dismiss);
  if (parsed.data.clearDismissed) await clearDismissals(session.user.id);

  const prefs = parsed.data.prefs
    ? await setNotifyPrefs(session.user.id, parsed.data.prefs as any)
    : await getNotifyPrefs(session.user.id);

  return NextResponse.json({ ok: true, prefs });
});
