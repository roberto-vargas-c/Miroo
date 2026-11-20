import { boardAndAccess } from "@/lib/boardAccess";
import { DB_MAX_BYTES } from "@/lib/media";
import { fetchPublic, readLimited } from "@/lib/safeFetch";

// Downloads a picture or file someone pasted as a link (for example an <img> in copied HTML), so the
// browser can add it to the board like a dropped file. Public addresses only, at most the upload limit.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const r = await boardAndAccess(id, sp.get("share"));
  if (!r?.access.canEdit) return Response.json({ error: "Not allowed" }, { status: 403 });
  let url: URL;
  try { url = new URL(sp.get("url") ?? ""); } catch { return Response.json({ error: "Invalid link" }, { status: 400 }); }
  try {
    const { res, url: final } = await fetchPublic(url, { timeoutMs: 15000, headers: { "user-agent": "Mozilla/5.0 (compatible; SchemaPaste/1.0)", accept: "image/*,*/*;q=0.8" } });
    if (!res.ok) return Response.json({ error: `The site answered ${res.status}` }, { status: 502 });
    const bytes = await readLimited(res, DB_MAX_BYTES);
    const type = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    const name = decodeURIComponent(final.pathname.split("/").pop() || "file").slice(0, 200);
    return new Response(bytes, { headers: { "content-type": type, "x-file-name": encodeURIComponent(name), "cache-control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error && e.message === "too big" ? "That file is over 25 MB" : "Couldn't download that file";
    return Response.json({ error: msg }, { status: 502 });
  }
}
