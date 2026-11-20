import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";

// Apps that people connect to their Schema account, so the app can add to their boards ("Send to Schema" in Keystone).
// A small authorization code flow: the app sends the person to /connect/<app>?redirect_uri=…&state=…, they allow it,
// Schema sends them back with a one-time code (5 minutes), and the app's server trades the code for a token at
// POST /api/apps/token. The token goes with each call as "Authorization: Bearer sch_…"; Schema keeps only its hash.
// The person disconnects the app on their profile page.

export type AppInfo = { id: string; name: string; does: string[]; origins: () => string[]; callbackPath: string };

const origin = (u: string | undefined) => { try { return u ? new URL(u).origin : null; } catch { return null; } };

export const APPS: Record<string, AppInfo> = {
  keystone: {
    id: "keystone",
    name: "Keystone",
    does: ["See the workspaces and boards you can edit", "Make new boards in your workspaces", "Add pictures (sheets and views of your projects) to boards you can edit"],
    // Keystone's address (KEYSTONE_URL); in development also a Keystone on this machine
    origins: () => [origin(process.env.KEYSTONE_URL), process.env.NODE_ENV !== "production" ? "http://localhost:5000" : null].filter((o): o is string => !!o),
    callbackPath: "/api/schema/callback",
  },
};

/** The app, when the redirect address is its own callback on its own address; otherwise null. */
export function appFor(appId: string, redirectUri: string | null | undefined): AppInfo | null {
  const app = APPS[appId];
  if (!app || !redirectUri) return null;
  let u: URL;
  try { u = new URL(redirectUri); } catch { return null; }
  return app.origins().includes(u.origin) && u.pathname === app.callbackPath && !u.username && !u.password ? app : null;
}

const codeKey = () => new TextEncoder().encode(`schema-app-code:${process.env.AUTH_SECRET}`);
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** The one-time code for the app, after the person allowed it. */
export async function issueCode(userId: string, app: AppInfo, redirectUri: string) {
  return new SignJWT({ sub: userId, app: app.id, redirect_uri: redirectUri })
    .setProtectedHeader({ alg: "HS256" }).setJti(randomBytes(16).toString("hex")).setIssuedAt().setExpirationTime("5m").sign(codeKey());
}

/** Trades a code for a token (once). Null when the code is unknown, expired, used, or for another address. */
export async function exchangeCode(code: string, redirectUri: string) {
  let p: { sub?: string; app?: string; redirect_uri?: string; jti?: string };
  try { p = (await jwtVerify(code, codeKey())).payload as typeof p; } catch { return null; }
  if (!p.sub || !p.app || !p.jti || p.redirect_uri !== redirectUri || !appFor(p.app, redirectUri)) return null;
  const user = await db.user.findUnique({ where: { id: p.sub }, select: { id: true, name: true, email: true } });
  if (!user) return null;
  const token = `sch_${randomBytes(32).toString("base64url")}`;
  try {
    await db.appToken.create({ data: { userId: user.id, app: p.app, tokenHash: hash(token), codeId: p.jti } });
  } catch {
    return null; // the code was used already
  }
  return { token, user };
}

/** The person an app calls for ("Authorization: Bearer sch_…"), with the app's id; null without a valid token. */
export async function appCaller(req: Request) {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(sch_[A-Za-z0-9_-]{20,100})$/);
  if (!m) return null;
  const t = await db.appToken.findUnique({
    where: { tokenHash: hash(m[1]) },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!t) return null;
  // when it was last used, at most once an hour
  if (!t.lastUsedAt || Date.now() - t.lastUsedAt.getTime() > 3600_000) {
    await db.appToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { user: t.user, app: t.app };
}

/** Width and height of a PNG, JPEG or WebP picture from its header; null for anything else. */
export function imageSize(b: Uint8Array): { width: number; height: number; type: string } | null {
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: u32(16), height: u32(20), type: "image/png" };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], type: "image/jpeg" };
      }
      i += 2 + len;
    }
    return null;
  }
  const s = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length > 30 && s(0, 4) === "RIFF" && s(8, 4) === "WEBP") {
    const kind = s(12, 4);
    if (kind === "VP8 ") return { width: ((b[27] << 8) | b[26]) & 0x3fff, height: ((b[29] << 8) | b[28]) & 0x3fff, type: "image/webp" };
    if (kind === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1, type: "image/webp" }; }
    if (kind === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), type: "image/webp" };
  }
  return null;
}
