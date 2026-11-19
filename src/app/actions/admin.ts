"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { atLeast, workspaceRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { PUBLIC_EMAIL_DOMAINS, domainHasToken, TXT_PREFIX } from "@/lib/auth/domains";
import { discover } from "@/lib/auth/oidc";
import { seal } from "@/lib/auth/secretBox";
import type { FormState } from "./auth";

async function requireAdmin(workspaceId: string) {
  const user = await requireUser();
  if (!atLeast(await workspaceRole(user.id, workspaceId), "ADMIN")) throw new Error("Only workspace admins can do that");
  return user;
}
const settings = (wid: string) => revalidatePath(`/w/${wid}/settings`);

// ── Domains ─────────────────────────────────────────────────────────────────

const domainSchema = z.string().trim().toLowerCase()
  .transform((d) => d.replace(/^https?:\/\//, "").replace(/^@/, "").replace(/\/.*$/, ""))
  .pipe(z.string().regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain like studio.com"));

export async function addDomain(workspaceId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireAdmin(workspaceId);
  const d = domainSchema.safeParse(form.get("domain"));
  if (!d.success) return { error: d.error.issues[0].message };
  if (PUBLIC_EMAIL_DOMAINS.has(d.data)) return { error: `${d.data} is a public email provider, so it can't belong to one workspace.` };
  if (await db.workspaceDomain.findUnique({ where: { workspaceId_domain: { workspaceId, domain: d.data } } })) return { error: "That domain is already listed." };
  const dom = await db.workspaceDomain.create({ data: { workspaceId, domain: d.data, verifyToken: randomBytes(16).toString("hex") } });
  await audit(workspaceId, user, "domain.added", { type: "domain", id: dom.id, name: dom.domain });
  settings(workspaceId);
  return { ok: `Added ${d.data}. Now add the TXT record below to its DNS and press Verify.` };
}

export async function verifyDomain(domainId: string): Promise<FormState> {
  const dom = await db.workspaceDomain.findUniqueOrThrow({ where: { id: domainId } });
  const user = await requireAdmin(dom.workspaceId);
  if (dom.verifiedAt) return { ok: "Already verified." };
  const taken = await db.workspaceDomain.findFirst({ where: { domain: dom.domain, verifiedAt: { not: null }, NOT: { workspaceId: dom.workspaceId } } });
  if (taken) return { error: `${dom.domain} is already verified by another workspace.` };
  if (!(await domainHasToken(dom.domain, dom.verifyToken))) {
    return { error: `We couldn't find the TXT record ${TXT_PREFIX}${dom.verifyToken} on ${dom.domain} yet. DNS changes can take up to an hour.` };
  }
  await db.workspaceDomain.update({ where: { id: domainId }, data: { verifiedAt: new Date() } });
  await audit(dom.workspaceId, user, "domain.verified", { type: "domain", id: dom.id, name: dom.domain });
  settings(dom.workspaceId);
  return { ok: `${dom.domain} is verified.` };
}

export async function updateDomain(domainId: string, form: FormData) {
  const dom = await db.workspaceDomain.findUniqueOrThrow({ where: { id: domainId } });
  const user = await requireAdmin(dom.workspaceId);
  const autoJoin = form.get("autoJoin") === "on";
  const joinRole = z.enum([WorkspaceRole.MEMBER, WorkspaceRole.VIEWER]).parse(form.get("joinRole") ?? "MEMBER");
  await db.workspaceDomain.update({ where: { id: domainId }, data: { autoJoin, joinRole } });
  await audit(dom.workspaceId, user, "domain.updated", { type: "domain", id: dom.id, name: dom.domain }, { autoJoin, joinRole });
  settings(dom.workspaceId);
}

export async function removeDomain(domainId: string) {
  const dom = await db.workspaceDomain.findUniqueOrThrow({ where: { id: domainId } });
  const user = await requireAdmin(dom.workspaceId);
  await db.workspaceDomain.delete({ where: { id: domainId } });
  await audit(dom.workspaceId, user, "domain.removed", { type: "domain", id: dom.id, name: dom.domain });
  settings(dom.workspaceId);
}

// ── Single sign-on ──────────────────────────────────────────────────────────

const ssoSchema = z.object({
  issuer: z.string().trim().url("Enter the issuer URL, e.g. https://yourcompany.okta.com").transform((u) => u.replace(/\/$/, "")),
  clientId: z.string().trim().min(1, "Enter the client ID").max(300),
  clientSecret: z.string().trim().max(2000),
});

export async function saveSso(workspaceId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireAdmin(workspaceId);
  const parsed = ssoSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { issuer, clientId, clientSecret } = parsed.data;
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(issuer);
  if (!issuer.startsWith("https://") && !local) return { error: "The issuer must use https." };
  const existing = await db.workspaceSso.findUnique({ where: { workspaceId } });
  if (!clientSecret && !existing) return { error: "Enter the client secret" };
  const enabled = form.get("enabled") === "on";
  const enforce = enabled && form.get("enforce") === "on";
  if (enabled) {
    if (!(await db.workspaceDomain.count({ where: { workspaceId, verifiedAt: { not: null } } }))) {
      return { error: "Verify at least one email domain first. SSO only signs in people at your verified domains." };
    }
    try {
      await discover(issuer);
    } catch (e) {
      return { error: `Couldn't read the issuer's OpenID configuration: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  }
  const data = { issuer, clientId, enabled, enforce, ...(clientSecret ? { clientSecretEnc: seal(clientSecret) } : {}) };
  await db.workspaceSso.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data, clientSecretEnc: seal(clientSecret) },
    update: data,
  });
  await audit(workspaceId, user, "sso.updated", { type: "sso", name: issuer }, {
    enabled, enforce, clientId, secretChanged: !!clientSecret,
    ...(existing ? { was: { issuer: existing.issuer, enabled: existing.enabled, enforce: existing.enforce } } : {}),
  });
  settings(workspaceId);
  return { ok: enabled ? "Saved. Single sign-on is on." : "Saved. Single sign-on is off." };
}
