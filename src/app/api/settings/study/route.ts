import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { getAvailability, memorySnapshot, resetMemory, setAvailability } from "@/lib/scholar/memory";
import { getLanguages, setLanguages } from "@/lib/scholar/language";
import { getTheme, setTheme } from "@/lib/scholar/themeStore";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [availability, memory, languages, theme] = await Promise.all([
    getAvailability(session.user.id),
    memorySnapshot(session.user.id),
    getLanguages(session.user.id),
    getTheme(session.user.id),
  ]);
  return NextResponse.json({ availability, memory, languages, theme });
});

const Body = z.object({
  weekdayMins: z.number().int().min(0).max(960).optional(),
  weekendMins: z.number().int().min(0).max(960).optional(),
  studyStartHour: z.number().int().min(0).max(23).optional(),
  studyEndHour: z.number().int().min(1).max(24).optional(),
  languages: z
    .object({
      interfaceLanguage: z.string().max(12).optional(),
      inputLanguage: z.string().max(12).optional(),
      responseLanguage: z.string().max(12).optional(),
    })
    .optional(),
  theme: z
    .object({
      h: z.number().min(0).max(360).optional(),
      h2: z.number().min(0).max(360).optional(),
      s: z.number().min(0).max(100).optional(),
      l: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export const PATCH = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  }

  const { languages, theme, ...availability } = parsed.data;

  if (languages) await setLanguages(session.user.id, languages);
  if (theme) await setTheme(session.user.id, theme);

  const [availabilityResult, languagesResult, themeResult] = await Promise.all([
    Object.keys(availability).length
      ? setAvailability(session.user.id, availability)
      : getAvailability(session.user.id),
    getLanguages(session.user.id),
    getTheme(session.user.id),
  ]);

  return NextResponse.json({ availability: availabilityResult, languages: languagesResult, theme: themeResult });
});

/** Wipe learned history. Deliberately a hard delete, not a soft flag. */
export const DELETE = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const removed = await resetMemory(session.user.id);
  return NextResponse.json({ ok: true, removed });
});
