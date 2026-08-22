import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { listHomework } from "@/lib/queries";
import { getAvailability, paceBySubject } from "@/lib/scholar/memory";
import { whatShouldIDoNow } from "@/lib/scholar/recommend";
import { analyseWorkload, rankByRisk } from "@/lib/scholar/workload";
import type { ScorableTask } from "@/lib/scholar/types";
import type { HomeworkDTO } from "@/lib/clientTypes";

export const runtime = "nodejs";

function toScorable(h: HomeworkDTO): ScorableTask {
  return {
    id: h.id,
    title: h.title,
    status: h.status,
    dueAt: h.dueAt,
    estimateMins: h.estimateMins,
    priority: h.priority,
    subject: h.subject?.name ?? "General",
    focusMins: Math.round((h.focusSeconds ?? 0) / 60),
  };
}

export const GET = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const url = new URL(req.url);

  // The client passes its own clock so scheduling reflects the student's local
  // time, not the server's — these differ whenever the app isn't self-hosted.
  const nowParam = url.searchParams.get("now");
  const parsedNow = nowParam ? new Date(nowParam) : new Date();
  const now = Number.isNaN(parsedNow.getTime()) ? new Date() : parsedNow;

  // "I have 90 minutes" — an explicit budget overrides the profile default.
  const minutesParam = url.searchParams.get("minutes");
  const availableMinsOverride =
    minutesParam && Number.isFinite(Number(minutesParam)) && Number(minutesParam) > 0
      ? Math.min(24 * 60, Number(minutesParam))
      : null;

  const [profile, pace, homework] = await Promise.all([
    getAvailability(userId),
    paceBySubject(userId),
    listHomework(userId),
  ]);
  const tasks = homework.map(toScorable);

  const nowContext = whatShouldIDoNow(tasks, {
    now,
    profile,
    paceBySubject: pace,
    availableMinsOverride,
  });

  const workload = analyseWorkload(tasks, { now, profile, paceBySubject: pace });

  // Risk per task id, so the list UI can explain each item without recomputing.
  const risks: Record<string, unknown> = {};
  for (const { task, risk } of rankByRisk(tasks, { now, profile, paceBySubject: pace })) {
    risks[task.id] = risk;
  }

  return NextResponse.json({ now: nowContext, workload, risks, profile });
});
