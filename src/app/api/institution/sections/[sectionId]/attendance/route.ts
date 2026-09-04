import { NextResponse } from "next/server";
import { z } from "zod";
import { institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { scopeOfSection, type ResourceScope } from "@/domains/assessment";
import { openRegister, recentRegisters, recordRegister } from "@/domains/attendance";

export const runtime = "nodejs";

type Params = { sectionId: string };

async function sectionScope({ params }: { params: Params }) {
  const scope = await scopeOfSection(params.sectionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * The register for a day, or the recent ones.
 *
 * Guarded by `assignment:create` — the teaching permission — because a
 * register is a list of which named children were in a room, and that is not
 * something a student may read about their class.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:create", scope: sectionScope },
  async ({ req, params, userId, scope }) => {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return NextResponse.json({ registers: await recentRegisters(params.sectionId) });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new NotFound();

    return NextResponse.json({
      register: await openRegister({
        organizationId: scope.organizationId,
        sectionId: params.sectionId,
        date,
        takenBy: userId,
      }),
    });
  }
);

const registerSchema = z.object({
  sessionId: z.string().trim().min(1).max(64),
  marks: z
    .array(
      z.object({
        userId: z.string().trim().min(1).max(64),
        state: z.enum(["present", "absent", "late", "excused"]),
        minutesLate: z.number().int().min(0).max(600).nullable().default(null),
        note: z.string().trim().max(500).default(""),
      })
    )
    .max(500),
});

/**
 * Take the register.
 *
 * The whole class at once, because that is how a register is taken. Anything
 * that changes a mark already recorded is written to the audit log with both
 * values — by then it is a correction to a legal record rather than an entry,
 * and somebody who was not there has to be able to see what happened.
 */
export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:create", scope: sectionScope },
  async ({ req, userId, scope }) => {
    const input = await readBody(req, registerSchema);

    const result = await recordRegister({
      organizationId: scope.organizationId,
      sessionId: input.sessionId,
      takenBy: userId,
      marks: input.marks,
    });

    return NextResponse.json(result);
  }
);
