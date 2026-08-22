import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { getAttachmentFile, listSubjects } from "@/lib/queries";
import { resolveAIConfig } from "@/lib/settings";
import { extractContent } from "@/lib/extract";
import { analyseAssignment } from "@/lib/documents/assignment";
import { parseSyllabus } from "@/lib/documents/syllabus";
import { buildStudyPlan } from "@/lib/documents/planner";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  attachmentId: z.string().min(1),
  mode: z.enum(["assignment", "syllabus"]).default("assignment"),
  nowISO: z.string().optional(),
  timezone: z.string().optional(),
});

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { attachmentId, mode } = parsed.data;
  const nowISO = parsed.data.nowISO || new Date().toISOString();
  const timezone = parsed.data.timezone || "UTC";

  const file = await getAttachmentFile(session.user.id, attachmentId);
  if (!file) return NextResponse.json({ error: "That file couldn't be found." }, { status: 404 });

  const buffer = Buffer.from(file.data, "base64");
  const content = await extractContent(buffer, file.filename, file.mimeType);

  if (content.kind === "unsupported") {
    return NextResponse.json({ error: content.reason, unsupported: true }, { status: 422 });
  }

  const cfg = await resolveAIConfig(session.user.id);
  if (cfg.provider === "heuristic") {
    return NextResponse.json(
      {
        error:
          "Reading documents needs an AI provider. Add a key in Settings → AI, then try again.",
        needsProvider: true,
      },
      { status: 422 }
    );
  }

  const payload = content.kind === "text"
    ? { text: content.text }
    : { image: { base64: content.base64, mimeType: content.mimeType } };

  try {
    if (mode === "syllabus") {
      const syllabus = await parseSyllabus(payload, { nowISO, timezone }, cfg);
      // The plan is generated deterministically from the extracted assessments,
      // and returned unsaved — the student commits it explicitly.
      const plan = buildStudyPlan(syllabus, { now: new Date(nowISO) });
      return NextResponse.json({
        mode: "syllabus",
        syllabus,
        plan,
        truncated: content.kind === "text" ? content.truncated : false,
        filename: file.filename,
      });
    }

    const subjects = await listSubjects(session.user.id);
    const assignment = await analyseAssignment(
      payload,
      { nowISO, timezone, knownSubjects: subjects.map((s) => s.name) },
      cfg
    );

    return NextResponse.json({
      mode: "assignment",
      assignment,
      truncated: content.kind === "text" ? content.truncated : false,
      filename: file.filename,
    });
  } catch (err: any) {
    // A provider failure here is expected and recoverable — the student can
    // still type the task in by hand, so this must read as a setback, not a crash.
    return NextResponse.json(
      { error: err?.message ?? "The AI couldn't read that file.", providerFailed: true },
      { status: 502 }
    );
  }
});
