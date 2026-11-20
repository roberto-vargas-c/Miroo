import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";
import { DB_MAX_BYTES, BUCKET_MAX_BYTES, IMAGE_TYPES, mediaBucket } from "@/lib/media";
import { mapMiroBoard, miroBoardId, type MiroConnector, type MiroItem } from "@/lib/board/miro";
import type { ImageElement } from "@/lib/board/types";
import { MIRO_API as API, MiroError, miroBoardAccess } from "@/lib/miroAuth";
const MAX_ITEMS = 3000;
const MAX_IMAGES = 80;

const Body = z.object({ link: z.string().min(3).max(500), token: z.string().min(10).max(500).optional() });

/**
 * Imports a Miro board through Miro's REST API, with the person's connected Miro account ("Connect Miro"),
 * or an access token pasted by hand (used for this request only, never stored or logged).
 * Returns elements laid out from (0, 0); the client places them.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  if (!r?.access.canEdit || !r.user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add the Miro board link" }, { status: 400 });
  const boardId = miroBoardId(parsed.data.link);
  if (!boardId) return NextResponse.json({ error: "That doesn't look like a Miro board link" }, { status: 400 });
  let auth: Record<string, string> = {};

  const miro = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${API}${path}`, { headers: auth });
    if (res.status === 401) throw new MiroError("Miro didn't accept the access token", 400);
    if (res.status === 403) throw new MiroError("The token can't read this board. Give the Miro app boards:read access and make sure you can open the board", 400);
    if (res.status === 404) throw new MiroError("Miro couldn't find that board", 400);
    if (res.status === 429) throw new MiroError("Miro is rate-limiting requests. Try again in a minute", 429);
    if (!res.ok) throw new MiroError(`Miro answered ${res.status}`);
    return res.json() as Promise<T>;
  };
  const all = async <T,>(path: string): Promise<T[]> => {
    const out: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await miro<{ data: T[]; cursor?: string }>(`${path}${path.includes("?") ? "&" : "?"}limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      out.push(...(page.data ?? []));
      cursor = page.cursor || undefined;
    } while (cursor && out.length < MAX_ITEMS);
    return out;
  };

  try {
    const b = encodeURIComponent(boardId);
    const { token, board } = await miroBoardAccess(r.user.id, boardId, parsed.data.token);
    auth = { authorization: `Bearer ${token}`, accept: "application/json" };
    const [items, connectors] = await Promise.all([all<MiroItem>(`/boards/${b}/items`), all<MiroConnector>(`/boards/${b}/connectors`)]);
    const result = mapMiroBoard(items, connectors);

    // Copy pictures into this board's storage; Miro's links need the token.
    const bucket = mediaBucket();
    const limit = bucket ? BUCKET_MAX_BYTES : DB_MAX_BYTES;
    let imageFailures = 0;
    const drop = new Set<string>();
    for (const [i, img] of result.images.entries()) {
      try {
        if (i >= MAX_IMAGES) throw new Error("too many");
        const u = new URL(img.miroUrl);
        u.searchParams.set("format", "original");
        u.searchParams.set("redirect", "false");
        const meta = await fetch(u, { headers: auth });
        if (!meta.ok) throw new Error(String(meta.status));
        const { url } = (await meta.json()) as { url?: string };
        if (!url) throw new Error("no url");
        // Only public https files (the local stand-in used in tests serves http).
        const fileUrl = new URL(url);
        if (fileUrl.protocol !== "https:" && !process.env.MIRO_API_URL) throw new Error("not https");
        if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(fileUrl.hostname) && !process.env.MIRO_API_URL) throw new Error("private host");
        const file = await fetch(url);
        const type = (file.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!file.ok || !IMAGE_TYPES.includes(type)) throw new Error("not an image");
        const bytes = await file.arrayBuffer();
        if (bytes.byteLength > limit) throw new Error("too big");
        const aid = randomBytes(16).toString("hex");
        if (bucket) {
          await bucket.put(aid, bytes, { httpMetadata: { contentType: type } });
          await db.asset.create({ data: { id: aid, boardId: id, mimeType: type, storage: "r2", size: bytes.byteLength }, select: { id: true } });
        } else {
          await db.asset.create({ data: { id: aid, boardId: id, mimeType: type, storage: "db", size: bytes.byteLength, data: Buffer.from(bytes) }, select: { id: true } });
        }
        const el = result.elements.find((e) => e.id === img.elementId) as ImageElement | undefined;
        if (el) { el.src = `/api/assets/${aid}`; el.animated = type === "image/gif" || undefined; }
      } catch {
        imageFailures++;
        drop.add(img.elementId);
      }
    }
    const elements = result.elements.filter((e) => !drop.has(e.id));
    return NextResponse.json({ name: board.name ?? "Miro board", elements, skipped: result.skipped, imageFailures, truncated: items.length >= MAX_ITEMS });
  } catch (e) {
    if (e instanceof MiroError) return NextResponse.json({ error: e.message, needsConnect: e.needsConnect || undefined }, { status: e.status });
    return NextResponse.json({ error: "Couldn't reach Miro. Try again" }, { status: 502 });
  }
}
