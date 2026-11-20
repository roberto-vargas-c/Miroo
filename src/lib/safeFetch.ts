import { isIPv4, lookupAll } from "@/lib/dns";

// Fetching links people give us, guarded against server-side request forgery:
// only http(s), only public IPs (checked again on every redirect), no credentials in the link.

export function isPrivate(ip: string): boolean {
  if (isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") ||
    v.startsWith("fea") || v.startsWith("feb");
}

export async function assertPublic(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
  if (u.username || u.password) throw new Error("credentials in url");
  const addrs = await lookupAll(u.hostname);
  if (!addrs.length || addrs.some(isPrivate)) throw new Error("private address");
}

/** GET a public URL, following at most 4 redirects, each checked with assertPublic. */
export async function fetchPublic(start: URL, init: { headers?: Record<string, string>; timeoutMs?: number } = {}) {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(init.timeoutMs ?? 5000), headers: init.headers });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url); continue; }
    return { res, url };
  }
  throw new Error("too many redirects");
}

/** Reads a response body, giving up once it passes `limit` bytes. */
export async function readLimited(res: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(res.headers.get("content-length") ?? NaN);
  if (declared > limit) throw new Error("too big");
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { reader.cancel().catch(() => {}); throw new Error("too big"); }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(size));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
