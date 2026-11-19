import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const APP_URL = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

type Mail = { to: string; subject: string; text: string };
const from = () => process.env.EMAIL_FROM ?? "Schema <no-reply@localhost>";

type SendEmail = { send(m: { to: string; from: string | { email: string; name: string }; subject: string; text: string }): Promise<unknown> };

/** The Cloudflare Email Sending binding, when running on Workers with one configured. */
function cloudflareEmail(): SendEmail | null {
  if (typeof navigator === "undefined" || navigator.userAgent !== "Cloudflare-Workers") return null;
  try {
    return ((getCloudflareContext().env as { EMAIL?: SendEmail }).EMAIL) ?? null;
  } catch {
    return null;
  }
}

/** "Schema <no-reply@x.com>" → { name, email }; a bare address stays a string. */
function parseFrom(f: string) {
  const m = f.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m && m[1] ? { name: m[1].trim(), email: m[2].trim() } : (m ? m[2].trim() : f.trim());
}

/**
 * Send an email. On Cloudflare it goes through the Worker's Email Sending binding (EMAIL). Otherwise, with RESEND_API_KEY it goes through Resend's HTTP API (works on Cloudflare Workers);
 * with SMTP_URL (e.g. smtps://user:pass@smtp.postmarkapp.com) through SMTP, on Node only. With
 * neither, the message is printed to the server log so local development works without a mail server.
 */
export async function sendMail(m: Mail) {
  try {
    const cf = cloudflareEmail();
    if (cf) return void (await cf.send({ to: m.to, from: parseFrom(from()), subject: m.subject, text: m.text }));
    if (process.env.RESEND_API_KEY) return await viaResend(m);
    if (process.env.SMTP_URL) return await viaSmtp(m, process.env.SMTP_URL);
    console.log(`[mail] to=${m.to} subject=${JSON.stringify(m.subject)}\n${m.text}\n[/mail]`);
  } catch (e) {
    // A mail outage shouldn't break sign-up or invites; the link is still shown or can be resent.
    console.error("[mail] send failed", e);
  }
}

async function viaResend(m: Mail) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: from(), to: [m.to], subject: m.subject, text: m.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let transport: import("nodemailer").Transporter | null = null;
async function viaSmtp(m: Mail, url: string) {
  const nodemailer = (await import("nodemailer")).default;
  transport ??= nodemailer.createTransport(url);
  await transport.sendMail({ from: from(), ...m });
}
