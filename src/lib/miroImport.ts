import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { DB_MAX_BYTES, BUCKET_MAX_BYTES, IMAGE_TYPES, mediaBucket } from "./media";
import { mapMiroBoard, type MiroConnector, type MiroItem } from "./board/miro";
import type { BoardElement, ImageElement } from "./board/types";
import { MIRO_API as API, MiroError } from "./miroAuth";

const MAX_ITEMS = 3000;
const MAX_IMAGES = 80;

export type MiroImportResult = { elements: BoardElement[]; skipped: Record<string, number>; imageFailures: number; truncated: boolean };

/**
 * Reads a Miro board's items and connectors through Miro's REST API and maps them to Schema elements,
 * laid out from (0, 0). Pictures are copied into the Schema board's storage (Miro's links need the token).
 */
export async function importMiroBoard(token: string, miroBoardId: string, schemaBoardId: string): Promise<MiroImportResult> {
  const auth = { authorization: `Bearer ${token}`, accept: "application/json" };

  const miro = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${API}${path}`, { headers: auth });
    if (res.status === 401) throw new MiroError("Miro didn't accept the sign-in. Connect Miro again", 400);
    if (res.status === 403) throw new MiroError("Miro didn't allow reading this board. Make sure you can open it in Miro and the app has boards:read", 400);
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

  {
    const b = encodeURIComponent(miroBoardId);
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
          await db.asset.create({ data: { id: aid, boardId: schemaBoardId, mimeType: type, storage: "r2", size: bytes.byteLength }, select: { id: true } });
        } else {
          await db.asset.create({ data: { id: aid, boardId: schemaBoardId, mimeType: type, storage: "db", size: bytes.byteLength, data: Buffer.from(bytes) }, select: { id: true } });
        }
        const el = result.elements.find((e) => e.id === img.elementId) as ImageElement | undefined;
        if (el) { el.src = `/api/assets/${aid}`; el.animated = type === "image/gif" || undefined; }
      } catch {
        imageFailures++;
        drop.add(img.elementId);
      }
    }
    const elements = result.elements.filter((e) => !drop.has(e.id));
    return { elements, skipped: result.skipped as Record<string, number>, imageFailures, truncated: items.length >= MAX_ITEMS };
  }
}

/** Gives imported elements stacking order: frames behind everything else, in Miro's order. */
export function stackImported(els: BoardElement[]): BoardElement[] {
  const z = Date.now();
  return els.map((x, i) => ({ ...x, z: x.type === "frame" ? z - 1000 + i : z + i }));
}
