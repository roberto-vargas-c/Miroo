/** Keystone's own host, when it is not on workers.dev or onrender.com (NEXT_PUBLIC_KEYSTONE_URL). */
const KEYSTONE_HOSTS = [process.env.NEXT_PUBLIC_KEYSTONE_URL]
  .map((u) => { try { return u ? new URL(u).hostname : null; } catch { return null; } })
  .filter((h): h is string => !!h);

/** A Keystone embed link (`https://keystone.<subdomain>.workers.dev/embed/<token>`, `https://keystone-xxxx.onrender.com/embed/…`,
 *  `http://localhost:5000/embed/…`, or on NEXT_PUBLIC_KEYSTONE_URL's host):
 *  the read-only 3D model, live as the team works on it. */
export function isKeystoneEmbed(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && u.hostname === "localhost")) return false;
  const host = u.hostname;
  const keystoneHost = /^keystone\.[a-z0-9-]+\.workers\.dev$/.test(host) || /^keystone(-[a-z0-9]+)*\.onrender\.com$/.test(host)
    || host === "localhost" || KEYSTONE_HOSTS.includes(host);
  return keystoneHost && /^\/embed\/[A-Za-z0-9._-]{1,140}\/?$/.test(u.pathname);
}

/** Turn a share URL into an embeddable player URL for known providers, or null to open it in a new tab. */
export function embedUrlFor(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  if (isKeystoneEmbed(raw)) return `${u.origin}${u.pathname}`;
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{6,})/)?.[1];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.match(/^\/(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "loom.com") {
    const id = u.pathname.match(/^\/share\/([\w-]+)/)?.[1];
    return id ? `https://www.loom.com/embed/${id}` : null;
  }
  if (host === "figma.com") return `https://www.figma.com/embed?embed_host=schema&url=${encodeURIComponent(raw)}`;
  return null;
}

export function looksLikeUrl(s: string) {
  return /^https?:\/\/[^\s]+$/i.test(s.trim());
}
