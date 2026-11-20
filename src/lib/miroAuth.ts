import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { APP_URL } from "./mail";
import { open, seal } from "./auth/secretBox";

// "Connect Miro": Miro's OAuth 2.0 authorization code flow. Tokens are stored per person and Miro team,
// sealed with AUTH_SECRET, and refreshed when the Miro app issues expiring tokens.
// MIRO_API_URL / MIRO_AUTH_URL only exist so tests can point this at a local stand-in.
export const MIRO_API = process.env.MIRO_API_URL ?? "https://api.miro.com/v2";
const MIRO_API_ROOT = MIRO_API.replace(/\/v2\/?$/, "");
const AUTHORIZE_URL = process.env.MIRO_AUTH_URL ?? "https://miro.com/oauth/authorize";

export const MIRO_CALLBACK_PATH = "/api/miro/callback";
export const MIRO_FLOW_COOKIE = "schema_miro_oauth";
export const miroRedirectUrl = () => `${APP_URL()}${MIRO_CALLBACK_PATH}`;

export function miroOAuth() {
  const clientId = process.env.MIRO_CLIENT_ID, clientSecret = process.env.MIRO_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export class MiroError extends Error {
  constructor(msg: string, public status = 502, public needsConnect = false) { super(msg); }
}

const flowKey = () => new TextEncoder().encode(`miro-oauth-state:${process.env.AUTH_SECRET}`);
export type MiroFlow = { state: string; userId: string; popup: boolean; next: string };

export async function beginMiroConnect(userId: string, popup: boolean, next: string) {
  const o = miroOAuth();
  if (!o) throw new MiroError("Connect Miro isn't set up on this server", 501);
  const flow: MiroFlow = { state: randomBytes(16).toString("base64url"), userId, popup, next };
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({ response_type: "code", client_id: o.clientId, redirect_uri: miroRedirectUrl(), state: flow.state }).toString();
  const cookie = await new SignJWT({ ...flow }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("15m").sign(flowKey());
  return { url: url.toString(), cookie };
}

export async function readMiroFlow(cookie: string | undefined): Promise<MiroFlow | null> {
  if (!cookie) return null;
  try { return (await jwtVerify(cookie, flowKey())).payload as unknown as MiroFlow; } catch { return null; }
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; team_id?: string | number; user_id?: string | number };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const o = miroOAuth();
  if (!o) throw new MiroError("Connect Miro isn't set up on this server", 501);
  const res = await fetch(`${MIRO_API_ROOT}/v1/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...params, client_id: o.clientId, client_secret: o.clientSecret }),
    signal: AbortSignal.timeout(10000),
  });
  const j = (await res.json().catch(() => ({}))) as TokenResponse & { message?: string };
  if (!res.ok || !j.access_token) throw new MiroError(j.message ?? `Miro answered ${res.status}`, res.status >= 500 ? 502 : 400);
  return j;
}

const expiry = (t: TokenResponse) => (t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null);

/** Finishes the sign-in: trades the code for tokens and saves them for this person and Miro team. */
export async function finishMiroConnect(userId: string, code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: miroRedirectUrl() });
  let teamId = t.team_id != null ? String(t.team_id) : "";
  let teamName: string | null = null;
  try {
    // Names the team, so people who connect several can tell them apart.
    const res = await fetch(`${MIRO_API_ROOT}/v1/oauth-token`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const info = (await res.json()) as { team?: { id?: string | number; name?: string } };
      teamName = info.team?.name?.slice(0, 120) ?? null;
      if (!teamId && info.team?.id != null) teamId = String(info.team.id);
    }
  } catch { /* the name is optional */ }
  if (!teamId) teamId = "default";
  const data = {
    teamName, accessTokenEnc: seal(t.access_token!), refreshTokenEnc: t.refresh_token ? seal(t.refresh_token) : null, expiresAt: expiry(t),
  };
  await db.miroConnection.upsert({ where: { userId_teamId: { userId, teamId } }, create: { userId, teamId, ...data }, update: data });
  return { teamId, teamName };
}

type Conn = { id: string; accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: Date | null };

async function refresh(c: Conn): Promise<string | null> {
  if (!c.refreshTokenEnc) return null;
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(c.refreshTokenEnc) });
    await db.miroConnection.update({
      where: { id: c.id },
      data: { accessTokenEnc: seal(t.access_token!), refreshTokenEnc: t.refresh_token ? seal(t.refresh_token) : c.refreshTokenEnc, expiresAt: expiry(t) },
    });
    return t.access_token!;
  } catch {
    return null;
  }
}

/** A usable access token for a connection, refreshed first when it's about to expire. Null when it's no longer valid. */
async function accessToken(c: Conn): Promise<string | null> {
  if (c.expiresAt && c.expiresAt.getTime() < Date.now() + 60_000) return refresh(c);
  try { return open(c.accessTokenEnc); } catch { return null; }
}

export async function listMiroConnections(userId: string) {
  return db.miroConnection.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true, teamId: true, teamName: true } });
}

export async function disconnectMiro(userId: string, id: string) {
  const c = await db.miroConnection.findFirst({ where: { id, userId } });
  if (!c) return false;
  await db.miroConnection.delete({ where: { id: c.id } });
  const o = miroOAuth();
  if (o) {
    // Best effort: also revoke the token at Miro.
    try {
      await fetch(`${MIRO_API}/oauth/revoke`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: o.clientId, client_secret: o.clientSecret, token: open(c.accessTokenEnc) }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* already removed here */ }
  }
  return true;
}

/**
 * Finds a token that can read this Miro board: the one pasted by hand if given, else each Miro team the
 * person connected, newest first. Answers with the token and the board, or throws a MiroError that says
 * what to do (needsConnect when there's nothing that works).
 */
export async function miroBoardAccess(userId: string, boardId: string, manualToken?: string): Promise<{ token: string; board: { name?: string } }> {
  const path = `${MIRO_API}/boards/${encodeURIComponent(boardId)}`;
  const probe = (token: string) => fetch(path, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const fail = (res: Response) => {
    if (res.status === 429) return new MiroError("Miro is rate-limiting requests. Try again in a minute", 429);
    if (res.status >= 500) return new MiroError(`Miro answered ${res.status}`);
    return null;
  };

  const conns = await db.miroConnection.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  if (manualToken) {
    const res = await probe(manualToken.trim());
    if (res.ok) return { token: manualToken.trim(), board: await res.json() };
    const hard = fail(res);
    if (hard) throw hard;
    // A token pasted earlier may have stopped working; a connected account can still do it.
    if (!conns.length || (res.status !== 401 && res.status !== 403)) {
      if (res.status === 401) throw new MiroError("Miro didn't accept the access token", 401, true);
      if (res.status === 403) throw new MiroError("The token can't read this board. Give the Miro app boards:read access and make sure you can open the board", 403, true);
      if (res.status === 404) throw new MiroError("Miro couldn't find that board", 404);
      throw new MiroError(`Miro answered ${res.status}`);
    }
  }

  if (!conns.length) throw new MiroError(miroOAuth() ? "Connect Miro to bring this over" : "Add a Miro access token", 401, true);
  let sawNotFound = false;
  for (const c of conns) {
    let token = await accessToken(c);
    let res = token ? await probe(token) : null;
    if (res?.status === 401 || !token) {
      token = await refresh(c);
      res = token ? await probe(token) : null;
      if (!token || res?.status === 401) { await db.miroConnection.delete({ where: { id: c.id } }).catch(() => {}); continue; }
    }
    if (res!.ok) {
      // Most recently used first next time.
      await db.miroConnection.update({ where: { id: c.id }, data: { updatedAt: new Date() } }).catch(() => {});
      return { token: token!, board: await res!.json() };
    }
    const hard = fail(res!);
    if (hard) throw hard;
    if (res!.status === 404) sawNotFound = true;
  }
  const left = await db.miroConnection.count({ where: { userId } });
  if (!left) throw new MiroError("Your Miro connection expired. Connect Miro again", 401, true);
  throw new MiroError(
    sawNotFound
      ? "Miro couldn't find that board in your connected teams. If it's in another team, connect Miro again and pick that team"
      : "Your connected Miro teams can't open this board. Connect Miro again and pick the team that has it",
    403, true,
  );
}

export type MiroBoardSummary = { id: string; name: string; teamId: string; teamName: string | null; modifiedAt?: string; owner?: string };

/** Every board the person can see in each connected Miro team, newest changes first. */
export async function listMiroBoards(userId: string): Promise<{ boards: MiroBoardSummary[]; failedTeams: string[] }> {
  const conns = await db.miroConnection.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  if (!conns.length) throw new MiroError(miroOAuth() ? "Connect Miro first" : "Connect Miro isn't set up on this server", 401, true);
  const seen = new Set<string>();
  const boards: MiroBoardSummary[] = [];
  const failedTeams: string[] = [];
  type Page = { data?: { id: string; name?: string; modifiedAt?: string; team?: { id?: string | number; name?: string }; owner?: { name?: string } }[]; total?: number };
  for (const c of conns) {
    let token = await accessToken(c);
    const get = (t: string, offset: number) =>
      fetch(`${MIRO_API}/boards?limit=50&offset=${offset}&sort=last_modified`, { headers: { authorization: `Bearer ${t}`, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    try {
      for (let offset = 0; offset < 2000; ) {
        let res = token ? await get(token, offset) : null;
        if (!res || res.status === 401) {
          token = await refresh(c);
          res = token ? await get(token, offset) : null;
        }
        if (res?.status === 429) throw new MiroError("Miro is rate-limiting requests. Try again in a minute", 429);
        if (!res?.ok) throw new Error(String(res?.status ?? "no token"));
        const page = (await res.json()) as Page;
        const data = page.data ?? [];
        for (const b of data) {
          if (seen.has(b.id)) continue;
          seen.add(b.id);
          boards.push({
            id: b.id, name: b.name || "Untitled board", modifiedAt: b.modifiedAt, owner: b.owner?.name,
            teamId: b.team?.id != null ? String(b.team.id) : c.teamId, teamName: b.team?.name ?? c.teamName,
          });
        }
        offset += data.length;
        if (!data.length || (page.total != null && offset >= page.total)) break;
      }
    } catch (e) {
      if (e instanceof MiroError) throw e;
      failedTeams.push(c.teamName ?? "a Miro team");
    }
  }
  boards.sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""));
  return { boards, failedTeams };
}
