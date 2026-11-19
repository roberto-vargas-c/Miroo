import { db } from "@/lib/db";
import { mediaBucket, parseRange } from "@/lib/media";

// Asset ids are 128-bit random values, so the URL itself acts as the capability to read it.
// Byte ranges are supported so videos can seek without downloading the whole file.
export async function GET(req: Request, { params }: { params: Promise<{ aid: string }> }) {
  const { aid } = await params;
  const meta = await db.asset.findUnique({ where: { id: aid }, select: { mimeType: true, storage: true, size: true } });
  if (!meta) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": meta.mimeType,
    "cache-control": "private, max-age=31536000, immutable",
    "accept-ranges": "bytes",
  };

  if (meta.storage === "r2") {
    const bucket = mediaBucket();
    if (!bucket) return new Response("Storage unavailable", { status: 503 });
    const range = parseRange(req.headers.get("range"), meta.size);
    const obj = await bucket.get(aid, range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined);
    if (!obj) return new Response("Not found", { status: 404 });
    if (range) {
      return new Response(obj.body, {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${range.start}-${range.end}/${obj.size}`, "content-length": String(range.end - range.start + 1) },
      });
    }
    return new Response(obj.body, { headers: { ...headers, "content-length": String(obj.size) } });
  }

  const a = await db.asset.findUnique({ where: { id: aid }, select: { data: true } });
  if (!a?.data) return new Response("Not found", { status: 404 });
  const data = new Uint8Array(a.data);
  const range = parseRange(req.headers.get("range"), data.length);
  if (range) {
    return new Response(data.subarray(range.start, range.end + 1), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${range.start}-${range.end}/${data.length}`, "content-length": String(range.end - range.start + 1) },
    });
  }
  return new Response(data, { headers: { ...headers, "content-length": String(data.length) } });
}
