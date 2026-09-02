import { NextResponse } from "next/server";
import { institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { deleteMaterial, scopeOfMaterial, setMaterialPublished } from "@/domains/library";
import { z } from "zod";

export const runtime = "nodejs";

type Params = { materialId: string };
type CourseScope = { organizationId: string; courseId: string };

async function materialScope({ params }: { params: Params }) {
  const scope = await scopeOfMaterial(params.materialId);
  if (!scope) throw new NotFound();
  return scope;
}

const publishSchema = z.object({ isPublished: z.boolean() });

/** Publishing is what makes a material visible to students. */
export const PATCH = institutionalRoute<Params, CourseScope>(
  { permission: "course:update", scope: materialScope },
  async ({ req, params }) => {
    const { isPublished } = await readBody(req, publishSchema);
    await setMaterialPublished(params.materialId, isPublished);
    return NextResponse.json({ ok: true, isPublished });
  }
);

/**
 * Remove a material.
 *
 * The file behind it goes too, unless something else still uses it — leaving
 * orphaned bytes in storage forever is how a bill grows without anyone
 * deciding anything.
 */
export const DELETE = institutionalRoute<Params, CourseScope>(
  { permission: "course:update", scope: materialScope },
  async ({ params }) => {
    await deleteMaterial(params.materialId);
    return NextResponse.json({ ok: true });
  }
);
