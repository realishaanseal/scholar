import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { PROVIDER_MAP } from "@/lib/ai/catalog";
import { listModels, pickDefault } from "@/lib/ai/models";
import { resolveAIConfig } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 45;

const Body = z.object({
  provider: z.string().refine((p) => p in PROVIDER_MAP, "Unknown provider"),
  /** A key typed but not yet saved. Omit to use the saved one. */
  apiKey: z.string().max(400).nullable().optional(),
});

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const saved = await resolveAIConfig(session.user.id);
  const apiKey =
    typeof parsed.data.apiKey === "string" && parsed.data.apiKey.trim()
      ? parsed.data.apiKey.trim()
      : saved.provider === parsed.data.provider
      ? saved.apiKey
      : null;

  try {
    const models = await listModels(parsed.data.provider, apiKey);
    return NextResponse.json({
      ok: true,
      models,
      suggested: pickDefault(models, parsed.data.provider),
    });
  } catch (err: any) {
    // Always a JSON body, never an empty response — the client parses this.
    return NextResponse.json({ ok: false, error: err?.message ?? "Could not list models." });
  }
});
