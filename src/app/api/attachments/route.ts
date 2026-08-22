import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createPendingAttachment } from "@/lib/queries";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB per file

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (20MB max)" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  const attachment = await createPendingAttachment(
    session.user.id,
    file.name || "file",
    file.type || "application/octet-stream",
    file.size,
    buf
  );

  return NextResponse.json(attachment, { status: 201 });
}
