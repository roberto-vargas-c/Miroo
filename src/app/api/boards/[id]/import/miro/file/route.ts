import { z } from "zod";
import { boardAndAccess } from "@/lib/boardAccess";
import { DB_MAX_BYTES } from "@/lib/media";
import { readLimited } from "@/lib/safeFetch";
import type { MiroItem } from "@/lib/board/miro";

// MIRO_API_URL only exists so tests can point this at a local stand-in.
const API = process.env.MIRO_API_URL ?? "https://api.miro.com/v2";

const Body = z.object({
  board: z.string().min(3).max(200),
  item: z.string().min(1).max(40),
  name: z.string().max(300).optional(),
  token: z.string().min(10).max(500),
});

class MiroError extends Error { constructor(msg: string, public status = 502) { super(msg); } }

/**
 * Downloads the file behind one item copied in Miro (a picture, PDF, video or other document) through
 * Miro's REST API, with the person's own token (used for this request only, never stored or logged).
 * Miro's clipboard holds only a reference to the file, not its bytes. Answers with the file itself, or
 * `{ link }` for items that point at a web page.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  if (!r?.access.canEdit || !r.user) return Response.json({ error: "Not allowed" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing Miro board, item or token" }, { status: 400 });
  const { board, item, name, token } = parsed.data;
  const auth = { authorization: `Bearer ${token.trim()}`, accept: "application/json" };
  const b = encodeURIComponent(board);

  const miro = async <T,>(path: string, allow404 = false): Promise<T | null> => {
    const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, { headers: auth });
    if (res.status === 401) throw new MiroError("Miro didn't accept the access token", 401);
    if (res.status === 403) throw new MiroError("The token can't read the board this was copied from. Give the Miro app boards:read access for that team", 403);
    if (res.status === 404 && allow404) return null;
    if (res.status === 404) throw new MiroError("Miro couldn't find that item. It may have been deleted", 404);
    if (res.status === 429) throw new MiroError("Miro is rate-limiting requests. Try again in a minute", 429);
    if (!res.ok) throw new MiroError(`Miro answered ${res.status}`);
    return res.json() as Promise<T>;
  };

  try {
    let it = await miro<MiroItem>(`/boards/${b}/items/${encodeURIComponent(item)}`, true);
    // Fall back to finding the item by its title, in case the copied id isn't the API's id.
    if (!it && name) {
      for (const type of ["image", "document"]) {
        let cursor: string | undefined;
        for (let page = 0; page < 10 && !it; page++) {
          const res = await miro<{ data: MiroItem[]; cursor?: string }>(`/boards/${b}/items?type=${type}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
          it = res?.data.find((x) => typeof x.data?.title === "string" && x.data.title.trim() === name.trim()) ?? null;
          cursor = res?.cursor || undefined;
          if (!cursor) break;
        }
        if (it) break;
      }
    }
    if (!it) throw new MiroError("Miro couldn't find that item. It may have been deleted", 404);

    const d = (it.data ?? {}) as Record<string, unknown>;
    const fileApi = typeof d.imageUrl === "string" ? d.imageUrl : typeof d.documentUrl === "string" ? d.documentUrl : "";
    if (!fileApi) {
      const link = typeof d.url === "string" ? d.url : null;
      if (link) return Response.json({ link, title: typeof d.title === "string" ? d.title : undefined });
      throw new MiroError(`Miro doesn't share the file for this kind of item (${it.type})`, 422);
    }
    // Miro's file links answer with a short-lived download URL.
    const u = new URL(fileApi);
    if (!/(^|\.)miro\.com$/.test(u.hostname) && !process.env.MIRO_API_URL) throw new MiroError("Unexpected file link from Miro");
    u.searchParams.set("format", "original");
    u.searchParams.set("redirect", "false");
    const meta = await miro<{ url?: string }>(u.toString());
    if (!meta?.url) throw new MiroError("Miro didn't give a download link");
    const fileUrl = new URL(meta.url);
    if (fileUrl.protocol !== "https:" && !process.env.MIRO_API_URL) throw new MiroError("Unexpected download link from Miro");
    const file = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) });
    if (!file.ok) throw new MiroError(`Miro's file storage answered ${file.status}`);
    const bytes = await readLimited(file, DB_MAX_BYTES);
    const type = (file.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    const title = (typeof d.title === "string" && d.title.trim()) || name || `${it.type}-${item}`;
    return new Response(bytes, { headers: { "content-type": type, "x-file-name": encodeURIComponent(title.slice(0, 200)), "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof MiroError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.message === "too big") return Response.json({ error: "That file is over 25 MB" }, { status: 413 });
    return Response.json({ error: "Couldn't reach Miro. Try again" }, { status: 502 });
  }
}
