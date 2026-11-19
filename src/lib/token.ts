// JWT helpers shared by the Next.js app and the realtime server.
import { SignJWT, jwtVerify } from "jose";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s === "change-me") throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type SessionClaims = { sub: string; name: string; email: string; sv: number };
export type RealtimeClaims = {
  sub: string; // user id or "guest:<random>"
  name: string;
  color: string;
  boardId: string;
  canEdit: boolean;
};

export async function signSession(c: SessionClaims) {
  return new SignJWT({ ...c, typ: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "session") return null;
    return { sub: String(payload.sub), name: String(payload.name), email: String(payload.email), sv: Number(payload.sv ?? 0) };
  } catch {
    return null;
  }
}

export async function signRealtime(c: RealtimeClaims) {
  return new SignJWT({ ...c, typ: "rt" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function verifyRealtime(token: string): Promise<RealtimeClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "rt") return null;
    return {
      sub: String(payload.sub),
      name: String(payload.name),
      color: String(payload.color),
      boardId: String(payload.boardId),
      canEdit: Boolean(payload.canEdit),
    };
  } catch {
    return null;
  }
}
