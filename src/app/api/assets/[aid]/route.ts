import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";
import { IMAGE_TYPES, VIDEO_TYPES, mediaBucket, parseRange } from "@/lib/media";

/**
 * Shown on the board; anything else (PDF originals, documents, HTML, SVG, scripts, archives…) is only ever downloaded, which needs edit access.
 * PDFs are shown as their rendered pages, so the original file is a download too.
 */
const INLINE = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

/** File extensions for downloads whose name doesn't carry one. */
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "application/pdf": "pdf",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv",
};

/**
 * Editors of the board the file was uploaded to may download it. So may editors of the board it's shown on (`board`), which can differ
 * for copied boards and templates; that board's saved content has to mention the file.
 */
async function canDownload(aid: string, ownerBoard: string, shownOn: string | null, share: string | null) {
  const owner = await boardAndAccess(ownerBoard, shownOn === ownerBoard || !shownOn ? share : null);
  if (owner?.access.canEdit) return true;
  if (!shownOn || shownOn === ownerBoard) return false;
  const here = await boardAndAccess(shownOn, share);
  return !!here?.access.canEdit && !!here.board.content && Buffer.from(here.board.content).includes(aid);
}

// Asset ids are 128-bit random values, so the URL itself acts as the capability to show it on the board.
// Saving a file is different: downloads (`?download=1`, and any file the browser can't show) need edit access to the asset's board.
// Byte ranges are supported so videos can seek without downloading the whole file.
export async function GET(req: Request, { params }: { params: Promise<{ aid: string }> }) {
  return serve(req, (await params).aid, false);
}

/** Lets the board check a download is allowed before starting it, without reading the file. */
export async function HEAD(req: Request, { params }: { params: Promise<{ aid: string }> }) {
  return serve(req, (await params).aid, true);
}

async function serve(req: Request, aid: string, head: boolean) {
  const meta = await db.asset.findUnique({ where: { id: aid }, select: { mimeType: true, storage: true, size: true, boardId: true } });
  if (!meta) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const download = sp.get("download") === "1" || !INLINE.has(meta.mimeType);
  if (download && !(await canDownload(aid, meta.boardId, sp.get("board"), sp.get("share")))) {
    return new Response("Only editors can download files from this board", { status: 403 });
  }
  const inline = !download;
  let name = (sp.get("name") ?? "").replace(/[\r\n"\\/]/g, "").slice(0, 200);
  if (download) {
    const ext = EXT[meta.mimeType];
    if (!name) name = "file";
    if (ext && !/\.[a-z0-9]{2,5}$/i.test(name)) name += `.${ext}`;
  }
  const headers: Record<string, string> = {
    "content-type": INLINE.has(meta.mimeType) || meta.mimeType === "application/pdf" ? meta.mimeType : "application/octet-stream",
    "x-content-type-options": "nosniff",
    ...(download || name ? { "content-disposition": `${inline ? "inline" : "attachment"}${name ? `; filename*=UTF-8''${encodeURIComponent(name)}` : ""}` } : {}),
    // Downloads depend on who is asking, so they're never reused from a cache.
    "cache-control": download ? "private, no-store" : "private, max-age=31536000, immutable",
    "accept-ranges": "bytes",
  };
  if (head) return new Response(null, { headers: { ...headers, "content-length": String(meta.size) } });

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
