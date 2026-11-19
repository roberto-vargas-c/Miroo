"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { beginLogin, ssoProvider, FLOW_COOKIE } from "@/lib/auth/oidc";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/session";
import { issueToken, consumeToken } from "@/lib/auth/tokens";
import { verifiedDomainFor } from "@/lib/auth/domains";
import { sendMail, APP_URL } from "@/lib/mail";
import { PRODUCT_NAME } from "@/lib/brand";

import { randomColor } from "@/lib/auth/users";

/** Compared against when there's no password, so failed logins take the same time either way. */
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export type FormState = { error?: string; ok?: string } | undefined;

function safeNext(next: unknown) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/w";
}

const password = z.string().min(8, "Use at least 8 characters").max(200);
const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password,
});

/** If the email's domain belongs to a workspace that requires SSO, the error to show instead of using a password. */
async function ssoRequired(email: string) {
  const dom = await verifiedDomainFor(email);
  return dom?.workspace.sso?.enabled && dom.workspace.sso.enforce
    ? `${dom.workspace.name} requires single sign-on. Use “Sign in with SSO”.`
    : null;
}

async function sendVerification(user: { id: string; email: string; name: string }) {
  const token = await issueToken(user.id, "VERIFY_EMAIL", 7 * 24 * 3600_000);
  await sendMail({
    to: user.email,
    subject: `Confirm your email for ${PRODUCT_NAME}`,
    text: `Hi ${user.name},\n\nConfirm your email address to finish setting up your account:\n${APP_URL()}/verify/${token}\n\nThe link works for 7 days.`,
  });
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with that email already exists" };
  const sso = await ssoRequired(email);
  if (sso) return { error: sso };
  const user = await db.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(parsed.data.password, 10), color: randomColor() },
  });
  // Every new account gets a personal workspace.
  await db.workspace.create({
    data: { name: `${name.split(" ")[0]}'s workspace`, members: { create: { userId: user.id, role: "OWNER" } } },
  });
  // Joining a company workspace by domain waits until the email is confirmed.
  await sendVerification(user);
  await createSession(user);
  redirect(safeNext(form.get("next")));
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const pw = String(form.get("password") ?? "");
  const sso = await ssoRequired(email);
  if (sso) return { error: sso };
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    // Constant-ish time so the response doesn't reveal whether the account exists.
    await bcrypt.compare(pw, DUMMY_HASH);
    return { error: user ? "This account uses Google or SSO to sign in. You can also set a password with “Forgot password”." : "Wrong email or password" };
  }
  if (!(await bcrypt.compare(pw, user.passwordHash))) return { error: "Wrong email or password" };
  await createSession(user);
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ── Password reset ──────────────────────────────────────────────────────────

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
  const user = await db.user.findUnique({ where: { email: email.data } });
  if (user) {
    const token = await issueToken(user.id, "RESET_PASSWORD", 60 * 60_000);
    await sendMail({
      to: user.email,
      subject: `Reset your ${PRODUCT_NAME} password`,
      text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your password. Choose a new one here:\n${APP_URL()}/reset/${token}\n\nThe link works for 1 hour. If you didn't ask for this, ignore this email.`,
    });
  }
  // Same answer either way, so this form can't be used to find out who has an account.
  return { ok: "If there's an account for that email, we've sent a link to reset the password. It works for 1 hour." };
}

export async function resetPassword(token: string, _: FormState, form: FormData): Promise<FormState> {
  const pw = password.safeParse(form.get("password"));
  if (!pw.success) return { error: pw.error.issues[0].message };
  if (form.get("password") !== form.get("confirm")) return { error: "The passwords don't match" };
  const user = await consumeToken(token, "RESET_PASSWORD");
  if (!user) return { error: "This link has expired or was already used. Ask for a new one." };
  const updated = await db.user.update({
    where: { id: user.id },
    // The emailed link proves the address, and bumping the version signs out every other session.
    data: { passwordHash: await bcrypt.hash(pw.data, 10), sessionVersion: { increment: 1 }, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  await createSession(updated);
  redirect("/w?reset=1");
}

export async function resendVerification(): Promise<FormState> {
  const user = await requireUser();
  if (user.emailVerifiedAt) return { ok: "Your email is already confirmed." };
  await sendVerification(user);
  return { ok: `We sent a new link to ${user.email}.` };
}

// ── Single sign-on entry ────────────────────────────────────────────────────

/** "Sign in with SSO": find the workspace that owns the email's domain and start its sign-in. */
export async function startSso(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter your work email" };
  const dom = await verifiedDomainFor(email.data);
  if (!dom?.workspace.sso?.enabled) return { error: "Single sign-on isn't set up for that email's domain. Log in with your password instead." };
  const provider = await ssoProvider(dom.workspaceId);
  if (!provider) return { error: "Single sign-on isn't set up for that email's domain." };
  let url: string;
  try {
    const flow = await beginLogin(provider, safeNext(form.get("next")), email.data);
    (await cookies()).set(FLOW_COOKIE, flow.cookie, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/oidc", maxAge: 600,
    });
    url = flow.url;
  } catch (e) {
    console.error("[oidc] start failed", e);
    return { error: "Couldn't reach your company's sign-in page. Try again, or ask your admin to check the SSO settings." };
  }
  redirect(url);
}
