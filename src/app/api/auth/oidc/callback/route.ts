import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { APP_URL } from "@/lib/mail";
import { emailDomain, joinByDomain, verifiedDomainFor } from "@/lib/auth/domains";
import { createVerifiedUser } from "@/lib/auth/users";
import { finishLogin, googleProvider, readFlowCookie, ssoProvider, FLOW_COOKIE, type OidcClaims } from "@/lib/auth/oidc";

function nameFrom(c: OidcClaims, email: string) {
  const n = (typeof c.name === "string" && c.name.trim()) || (typeof c.given_name === "string" && c.given_name.trim()) || email.split("@")[0];
  return n.slice(0, 80);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const jar = await cookies();
  const flow = await readFlowCookie(jar.get(FLOW_COOKIE)?.value);
  jar.delete({ name: FLOW_COOKIE, path: "/api/auth/oidc" });
  const fail = (msg: string) => NextResponse.redirect(`${APP_URL()}/login?error=${encodeURIComponent(msg)}`);

  if (u.searchParams.get("error")) return fail(u.searchParams.get("error_description") ?? "Sign-in was cancelled.");
  const code = u.searchParams.get("code");
  if (!flow || !code || u.searchParams.get("state") !== flow.state) return fail("That sign-in link expired. Please try again.");

  const isSso = flow.provider.startsWith("sso:");
  const provider = isSso ? await ssoProvider(flow.provider.slice(4)) : flow.provider === "google" ? googleProvider() : null;
  if (!provider) return fail("This sign-in method is no longer available.");

  let claims: OidcClaims;
  try {
    claims = await finishLogin(provider, flow, code);
  } catch (e) {
    console.error("[oidc] callback failed", e);
    return fail("Sign-in failed. Try again, or ask your admin to check the SSO settings.");
  }
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const sub = String(claims.sub ?? "");
  if (!email || !sub) return fail("The sign-in provider didn't share an email address.");

  let workspace: { id: string; name: string } | null = null;
  if (isSso) {
    // A workspace's identity provider may only vouch for emails at domains that workspace has verified.
    const dom = await db.workspaceDomain.findFirst({
      where: { workspaceId: provider.workspaceId!, domain: emailDomain(email), verifiedAt: { not: null } },
      include: { workspace: { select: { id: true, name: true } } },
    });
    if (!dom) return fail(`${email} isn't at a domain this workspace has verified.`);
    workspace = dom.workspace;
  } else {
    if (claims.email_verified !== true && claims.email_verified !== "true") return fail("Your Google account's email isn't verified.");
    const dom = await verifiedDomainFor(email);
    if (dom?.workspace.sso?.enabled && dom.workspace.sso.enforce) return fail(`${dom.workspace.name} requires single sign-on. Use “Sign in with SSO”.`);
  }

  // Find the account: by this provider identity, else by email (linking it), else create one.
  const identity = await db.identity.findUnique({ where: { provider_subject: { provider: provider.id, subject: sub } }, include: { user: true } });
  let user = identity?.user ?? (await db.user.findUnique({ where: { email } }));
  if (!user) user = await createVerifiedUser(email, nameFrom(claims, email), !isSso);
  if (!identity) await db.identity.create({ data: { provider: provider.id, subject: sub, userId: user.id } });
  if (!user.emailVerifiedAt && user.email === email) {
    user = await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }

  let next = flow.next;
  if (workspace) {
    const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } } });
    if (!member) {
      await db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "MEMBER" } });
      await audit(workspace.id, user, "member.joined_sso", { type: "user", id: user.id, name: user.name });
    }
    await audit(workspace.id, user, "sso.login", { type: "user", id: user.id, name: user.name });
    if (next === "/w") next = `/w/${workspace.id}`;
  }
  await joinByDomain(user);
  await createSession(user);
  return NextResponse.redirect(`${APP_URL()}${next}`);
}
