import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { APP_URL } from "./mail";
import { open, seal } from "./auth/secretBox";

// "Connect Keystone": the person's Keystone account, so a board can list their Keystone projects and put a project's live
// 3D model on the board. Keystone (KEYSTONE_URL) runs the same small code flow as Schema does for apps (src/lib/apps.ts):
// /connect/schema on Keystone, a one-time code back to /api/keystone/callback, traded for a token at Keystone's
// POST /api/apps/token. The token is stored sealed with AUTH_SECRET, one Keystone account per person.

export const KEYSTONE_URL = () => (process.env.KEYSTONE_URL ?? "").replace(/\/$/, "") || null;
export const KEYSTONE_CALLBACK_PATH = "/api/keystone/callback";
export const KEYSTONE_FLOW_COOKIE = "schema_keystone_connect";
export const keystoneRedirectUrl = () => `${APP_URL()}${KEYSTONE_CALLBACK_PATH}`;

export class KeystoneError extends Error {
  constructor(msg: string, public status = 502, public needsConnect = false) { super(msg); }
}

const flowKey = () => new TextEncoder().encode(`keystone-connect-state:${process.env.AUTH_SECRET}`);
export type KeystoneFlow = { state: string; userId: string; popup: boolean; next: string };

export async function beginKeystoneConnect(userId: string, popup: boolean, next: string) {
  const base = KEYSTONE_URL();
  if (!base) throw new KeystoneError("Keystone isn't set up on this server (KEYSTONE_URL)", 501);
  const flow: KeystoneFlow = { state: randomBytes(16).toString("base64url"), userId, popup, next };
  const url = new URL(`${base}/connect/schema`);
  url.search = new URLSearchParams({ redirect_uri: keystoneRedirectUrl(), state: flow.state }).toString();
  const cookie = await new SignJWT({ ...flow }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("15m").sign(flowKey());
  return { url: url.toString(), cookie };
}

export async function readKeystoneFlow(cookie: string | undefined): Promise<KeystoneFlow | null> {
  if (!cookie) return null;
  try { return (await jwtVerify(cookie, flowKey())).payload as unknown as KeystoneFlow; } catch { return null; }
}

/** Trades Keystone's code for its token and keeps it for this person. */
export async function finishKeystoneConnect(userId: string, code: string) {
  const base = KEYSTONE_URL();
  if (!base) throw new KeystoneError("Keystone isn't set up on this server (KEYSTONE_URL)", 501);
  const res = await fetch(`${base}/api/apps/token`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ code, redirect_uri: keystoneRedirectUrl() }), signal: AbortSignal.timeout(20000),
  });
  const j = (await res.json().catch(() => ({}))) as { token?: string; user?: { name?: string; email?: string }; error?: string };
  if (!res.ok || !j.token) throw new KeystoneError(j.error ?? `Keystone answered ${res.status}`, 400);
  const data = { tokenEnc: seal(j.token), accountName: j.user?.name?.slice(0, 120) ?? null, accountEmail: j.user?.email?.slice(0, 200) ?? null };
  await db.keystoneConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return data;
}

/** A call to Keystone's API as the person's connected account. */
export async function keystoneFetch(userId: string, path: string, init: RequestInit = {}) {
  const base = KEYSTONE_URL();
  if (!base) throw new KeystoneError("Keystone isn't set up on this server (KEYSTONE_URL)", 501);
  const c = await db.keystoneConnection.findUnique({ where: { userId } });
  if (!c) throw new KeystoneError("Connect Keystone first", 401, true);
  let token: string;
  try { token = open(c.tokenEnc); } catch { throw new KeystoneError("Connect Keystone again", 401, true); }
  // the container behind Keystone can take a few seconds to wake up
  const res = await fetch(`${base}${path}`, {
    ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(30000),
  });
  if (res.status === 401) {
    await db.keystoneConnection.delete({ where: { id: c.id } }).catch(() => {});
    throw new KeystoneError("Keystone signed this connection out. Connect Keystone again", 401, true);
  }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new KeystoneError((j as { error?: string } | null)?.error ?? `Keystone answered ${res.status}`, res.status >= 500 ? 502 : res.status);
  return { json: j, account: { name: c.accountName, email: c.accountEmail } };
}
