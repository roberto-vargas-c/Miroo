import "server-only";

export const APP_URL = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

type Mail = { to: string; subject: string; text: string };
const from = () => process.env.EMAIL_FROM ?? "Schema <no-reply@localhost>";

/**
 * Send an email. With RESEND_API_KEY it goes through Resend's HTTP API (works on Cloudflare Workers);
 * with SMTP_URL (e.g. smtps://user:pass@smtp.postmarkapp.com) through SMTP, on Node only. With
 * neither, the message is printed to the server log so local development works without a mail server.
 */
export async function sendMail(m: Mail) {
  try {
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
