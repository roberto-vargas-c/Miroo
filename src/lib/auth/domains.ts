import "server-only";
import { resolveTxt } from "node:dns/promises";
import { db } from "../db";
import { audit } from "../audit";

/** Free email providers can't be claimed by a workspace. */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.es", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "gmx.net", "web.de",
  "mail.com", "zoho.com", "yandex.com", "qq.com", "163.com", "t-online.de", "hey.com", "fastmail.com",
]);

export const emailDomain = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";

export const TXT_PREFIX = "schema-verification=";

/**
 * Check the DNS TXT record for a domain claim. DOMAIN_VERIFICATION=off skips the lookup, for
 * local development only; it is ignored in production.
 */
export async function domainHasToken(domain: string, token: string) {
  if (process.env.DOMAIN_VERIFICATION === "off" && process.env.NODE_ENV !== "production") return true;
  try {
    const records = await resolveTxt(domain);
    return records.some((r) => r.join("").trim() === `${TXT_PREFIX}${token}`);
  } catch {
    return false;
  }
}

/** The workspace (if any) whose verified domain covers this email. */
export async function verifiedDomainFor(email: string) {
  const d = emailDomain(email);
  if (!d) return null;
  return db.workspaceDomain.findFirst({ where: { domain: d, verifiedAt: { not: null } }, include: { workspace: { include: { sso: true } } } });
}

/** Add a user with a verified email to workspaces that auto-join their domain. */
export async function joinByDomain(user: { id: string; name: string; email: string }) {
  const d = emailDomain(user.email);
  if (!d) return;
  const domains = await db.workspaceDomain.findMany({ where: { domain: d, verifiedAt: { not: null }, autoJoin: true } });
  for (const dom of domains) {
    const exists = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: dom.workspaceId, userId: user.id } } });
    if (exists) continue;
    await db.workspaceMember.create({ data: { workspaceId: dom.workspaceId, userId: user.id, role: dom.joinRole } });
    await audit(dom.workspaceId, user, "member.joined_domain", { type: "user", id: user.id, name: user.name }, { domain: d, role: dom.joinRole });
  }
}
