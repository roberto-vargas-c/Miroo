import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  if (!r?.access.canEdit) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ error: "Only PNG, JPEG, GIF and WebP images are supported" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Images must be under 8 MB" }, { status: 400 });
  const asset = await db.asset.create({
    data: { id: randomBytes(16).toString("hex"), boardId: id, mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) },
    select: { id: true },
  });
  return NextResponse.json({ url: `/api/assets/${asset.id}` });
}
