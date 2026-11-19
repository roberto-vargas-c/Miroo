import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenKind } from "@prisma/client";
import { db } from "../db";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Create a one-time token for an emailed link. Older unused tokens of the same kind are dropped. */
export async function issueToken(userId: string, kind: AuthTokenKind, ttlMs: number) {
  const raw = randomBytes(32).toString("base64url");
  await db.authToken.deleteMany({ where: { userId, kind, usedAt: null } });
  await db.authToken.create({ data: { userId, kind, tokenHash: hash(raw), expiresAt: new Date(Date.now() + ttlMs) } });
  return raw;
}

/** Look up a valid token without using it (to render the reset form). */
export async function peekToken(raw: string, kind: AuthTokenKind) {
  const t = await db.authToken.findUnique({ where: { tokenHash: hash(raw) }, include: { user: true } });
  if (!t || t.kind !== kind || t.usedAt || t.expiresAt < new Date()) return null;
  return t;
}

/** Use a token once. Returns the user, or null if it is unknown, used or expired. */
export async function consumeToken(raw: string, kind: AuthTokenKind) {
  const t = await peekToken(raw, kind);
  if (!t) return null;
  // Guard against two requests using the same token at once.
  const { count } = await db.authToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1 ? t.user : null;
}
