import { NextResponse } from "next/server";
import { fetchPublic } from "@/lib/safeFetch";
import { currentUser } from "@/lib/session";

// Fetches a page's title/description for link cards. Guards against server-side request forgery:
// only http(s), only public IPs, a few redirects at most, small and slow responses cut off.

function pick(html: string, re: RegExp) {
  const m = html.match(re);
  return m ? decode(m[1].trim()).slice(0, 300) : undefined;
}
function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function meta(html: string, prop: string) {
  return pick(html, new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i")) ??
    pick(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
}

export async function GET(req: Request) {
  if (!(await currentUser())) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let url: URL;
  try { url = new URL(raw); } catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }
  try {
    const got = await fetchPublic(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; SchemaLinkPreview/1.0)", accept: "text/html" } });
    const res = got.res;
    url = got.url;
    if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) {
      return NextResponse.json({ title: null, site: url.hostname.replace(/^www\./, "") });
    }
    // Read at most 512 KB.
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 512 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return NextResponse.json({
      title: meta(html, "og:title") ?? pick(html, /<title[^>]*>([^<]*)<\/title>/i) ?? null,
      description: meta(html, "og:description") ?? meta(html, "description") ?? null,
      site: meta(html, "og:site_name") ?? url.hostname.replace(/^www\./, ""),
    });
  } catch {
    return NextResponse.json({ title: null, site: url.hostname.replace(/^www\./, "") });
  }
}
