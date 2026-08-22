import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { PROVIDER_MAP } from "@/lib/ai/catalog";
import { deleteAPIKey, getAISettings, resetAISettings, saveAISettings } from "@/lib/settings";

export const runtime = "nodejs";

const PutBody = z.object({
  provider: z.string().refine((p) => p in PROVIDER_MAP, "Unknown provider"),
  model: z.string().max(120).nullable().optional(),
  // omitted = keep existing key, null = clear it, string = replace it
  apiKey: z.string().max(400).nullable().optional(),
});

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await getAISettings(session.user.id));
});

export const PUT = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid settings" },
      { status: 400 }
    );
  }

  const info = PROVIDER_MAP[parsed.data.provider];
  const clearing = parsed.data.apiKey === null;
  const setting = typeof parsed.data.apiKey === "string" && parsed.data.apiKey.trim().length > 0;

  if (info.needsKey && clearing) {
    return NextResponse.json(
      { error: `${info.label} needs an API key. Delete the key only if you also switch provider.` },
      { status: 400 }
    );
  }
  if (!info.needsKey && setting) {
    return NextResponse.json({ error: `${info.label} doesn't use an API key.` }, { status: 400 });
  }

  return NextResponse.json(await saveAISettings(session.user.id, parsed.data));
});

/** ?scope=key removes just the API key; ?scope=all reverts to the server .env config. */
export const DELETE = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = new URL(req.url).searchParams.get("scope") ?? "key";
  const result = scope === "all" ? await resetAISettings(session.user.id) : await deleteAPIKey(session.user.id);

  return NextResponse.json(result);
});
