import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { listSubjects, listTimetable } from "@/lib/queries";
import { resolveAIConfig } from "@/lib/settings";
import { parseHomework } from "@/lib/ai";
import { getLanguages, inputLanguageInstruction } from "@/lib/scholar/language";
import { describeScheduleForPrompt } from "@/lib/scholar/timetableSchedule";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  raw: z.string().trim().min(3).max(4000),
  nowISO: z.string().optional(),
  timezone: z.string().optional(),
  tzOffsetMinutes: z.number().int().min(-900).max(900).optional(),
});

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = Body.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Give me a little more to work with." }, { status: 400 });
  }

  const [subjects, languages, aiConfig, timetable] = await Promise.all([
    listSubjects(session.user.id),
    getLanguages(session.user.id),
    resolveAIConfig(session.user.id),
    listTimetable(session.user.id),
  ]);

  const nowISO = parsedBody.data.nowISO || new Date().toISOString();
  const tzOffsetMinutes = parsedBody.data.tzOffsetMinutes ?? 0;
  // `now` with the user's local wall-clock in its UTC fields, matching the
  // convention the schedule helpers and the heuristic parser both use.
  const nowLocal = new Date(new Date(nowISO).getTime() + tzOffsetMinutes * 60_000);

  try {
    const result = await parseHomework(
      {
        raw: parsedBody.data.raw,
        nowISO,
        timezone: parsedBody.data.timezone || "UTC",
        tzOffsetMinutes,
        knownSubjects: subjects.map((s) => s.name),
        languageHint: inputLanguageInstruction(languages),
        scheduleContext: timetable.length ? describeScheduleForPrompt(timetable, nowLocal) : undefined,
        timetableSlots: timetable.length ? timetable : undefined,
      },
      aiConfig
    );

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Couldn't parse that just now.", providerFailed: true },
      { status: 502 }
    );
  }
});
