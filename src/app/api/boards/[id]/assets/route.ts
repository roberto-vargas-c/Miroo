import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";
import { BUCKET_MAX_BYTES, DB_MAX_BYTES, IMAGE_TYPES, VIDEO_TYPES, mediaBucket } from "@/lib/media";

const MEDIA = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);
/** Media types as sent, anything else kept as a plain download (see the asset route). */
const typeOf = (t: string) => (MEDIA.has(t) || /^[a-z]+\/[a-z0-9.+-]+$/.test(t) ? t : "application/octet-stream");
const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

// Uploads a file for a board: an image, a video or any other file (kept as a download). The body is either the raw file (with its type as the
// content-type, which lets big videos stream straight into object storage) or a form with "file".
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  if (!r?.access.canEdit) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const ctype = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  let type: string, size: number, body: ReadableStream | null = null, bytes: ArrayBuffer | null = null;
  if (ctype === "multipart/form-data") {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    type = typeOf((file.type || "application/octet-stream").toLowerCase()); size = file.size;
    if (size <= BUCKET_MAX_BYTES) bytes = await file.arrayBuffer();
  } else {
    type = typeOf(ctype || "application/octet-stream");
    size = Number(req.headers.get("content-length") ?? NaN);
    if (!Number.isFinite(size)) return NextResponse.json({ error: "Missing file size" }, { status: 411 });
    body = req.body;
  }

  const bucket = mediaBucket();
  const limit = bucket ? BUCKET_MAX_BYTES : DB_MAX_BYTES;
  if (size > limit) return NextResponse.json({ error: `Files must be under ${mb(limit)}` }, { status: 413 });

  const aid = randomBytes(16).toString("hex");
  if (bucket) {
    let value: ReadableStream | ArrayBuffer;
    if (bytes) value = bytes;
    else {
      // R2 needs a stream of known length; the request is re-wrapped on its way here, so say it again.
      const FLS = (globalThis as unknown as { FixedLengthStream?: new (n: number) => TransformStream }).FixedLengthStream;
      if (FLS) {
        const fixed = new FLS(size);
        body!.pipeTo(fixed.writable).catch(() => {});
        value = fixed.readable;
      } else value = await new Response(body).arrayBuffer();
    }
    await bucket.put(aid, value, { httpMetadata: { contentType: type } });
    await db.asset.create({ data: { id: aid, boardId: id, mimeType: type, storage: "r2", size }, select: { id: true } });
  } else {
    const data = Buffer.from(bytes ?? (await new Response(body).arrayBuffer()));
    if (data.length > limit) return NextResponse.json({ error: `Files must be under ${mb(limit)}` }, { status: 413 });
    await db.asset.create({ data: { id: aid, boardId: id, mimeType: type, storage: "db", size: data.length, data }, select: { id: true } });
  }
  return NextResponse.json({ url: `/api/assets/${aid}`, type });
}
