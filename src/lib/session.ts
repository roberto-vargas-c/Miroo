import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { signSession, verifySession } from "./token";

export const SESSION_COOKIE = "mr_session";

export async function createSession(user: { id: string; name: string; email: string; sessionVersion: number }) {
  const token = await signSession({ sub: user.id, name: user.name, email: user.email, sv: user.sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, color: true, emailVerifiedAt: true, sessionVersion: true, avatarVersion: true },
  });
  // Sessions issued before a password reset (or "sign out everywhere") are no longer valid.
  if (!user || user.sessionVersion !== claims.sv) return null;
  return user;
}

export async function requireUser(next?: string) {
  const user = await currentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
