import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { PROVIDER_MAP } from "@/lib/ai/catalog";
import { parseWith } from "@/lib/ai";
import { resolveAIConfig } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 45;

const Body = z.object({
  provider: z.string().refine((p) => p in PROVIDER_MAP, "Unknown provider"),
  model: z.string().max(120).nullable().optional(),
  /** Omit to test the key already saved. */
  apiKey: z.string().max(400).nullable().optional(),
});

const PROBE = "chemistry lab report on titration due tomorrow at 5pm, it's graded";

export const POST = jsonRoute(async (req: Request) => {
  {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid test request." }, { status: 400 });
    }

    const info = PROVIDER_MAP[parsed.data.provider];
    const saved = await resolveAIConfig(session.user.id);

    const apiKey =
      typeof parsed.data.apiKey === "string" && parsed.data.apiKey.trim()
        ? parsed.data.apiKey.trim()
        : saved.provider === parsed.data.provider
        ? saved.apiKey
        : null;

    if (info.needsKey && !apiKey) {
      return NextResponse.json({ ok: false, error: `Enter an API key for ${info.label} first.` });
    }

    const started = Date.now();
    try {
      const result = await parseWith(
        {
          raw: PROBE,
          nowISO: new Date().toISOString(),
          timezone: "UTC",
          tzOffsetMinutes: 0,
          knownSubjects: [],
        },
        { provider: parsed.data.provider, apiKey, model: parsed.data.model ?? null, origin: "user" }
      );

      return NextResponse.json({
        ok: true,
        ms: Date.now() - started,
        model: parsed.data.model || info.defaultModel,
        sample: { title: result.title, subject: result.subject, dueAt: result.dueAt },
      });
    } catch (err: any) {
      return NextResponse.json({
        ok: false,
        ms: Date.now() - started,
        error: err?.message ?? "Test failed.",
      });
    }
  }
});
