// DNS lookups over HTTPS (Cloudflare's 1.1.1.1 resolver), so they work the same on Node and on
// Cloudflare Workers, which has no system resolver.
type Answer = { type: number; data: string };
const TYPES = { A: 1, AAAA: 28, TXT: 16 } as const;

async function query(name: string, type: keyof typeof TYPES): Promise<Answer[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const body = (await res.json()) as { Status: number; Answer?: Answer[] };
  if (body.Status !== 0 && body.Status !== 3) throw new Error(`DNS lookup failed (status ${body.Status})`);
  return (body.Answer ?? []).filter((a) => a.type === TYPES[type]);
}

/** TXT records, each joined into one string with quotes removed. */
export async function resolveTxt(name: string): Promise<string[]> {
  return (await query(name, "TXT")).map((a) => a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
}

/** Every IPv4 and IPv6 address for a host name (the name itself if it's already an IP). */
export async function lookupAll(host: string): Promise<string[]> {
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIPv4(bare) || bare.includes(":")) return [bare];
  const [a, aaaa] = await Promise.all([query(bare, "A"), query(bare, "AAAA")]);
  return [...a, ...aaaa].map((x) => x.data);
}

export const isIPv4 = (s: string) => /^(\d{1,3})(\.\d{1,3}){3}$/.test(s);
