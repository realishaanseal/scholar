import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteAttachment, getAttachmentFile } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await getAttachmentFile(session.user.id, id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buf = Buffer.from(file.data, "base64");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ok = await deleteAttachment(session.user.id, id);
  return NextResponse.json({ ok });
}
