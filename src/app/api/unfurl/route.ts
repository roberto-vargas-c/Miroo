import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { currentUser } from "@/lib/session";

// Fetches a page's title/description for link cards. Guards against server-side request forgery:
// only http(s), only public IPs, a few redirects at most, small and slow responses cut off.

function isPrivate(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") ||
    v.startsWith("fea") || v.startsWith("feb");
}

async function assertPublic(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
  if (u.username || u.password) throw new Error("credentials in url");
  const addrs = await lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new Error("private address");
}

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
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublic(url);
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; SchemaLinkPreview/1.0)", accept: "text/html" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url); continue; }
      break;
    }
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
