import "server-only";
import nodemailer from "nodemailer";

export const APP_URL = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

let transport: nodemailer.Transporter | null = null;

/**
 * Send an email through SMTP_URL (e.g. smtps://user:pass@smtp.postmarkapp.com). Without SMTP_URL,
 * the message is printed to the server log so local development works without a mail server.
 */
export async function sendMail(m: { to: string; subject: string; text: string }) {
  const url = process.env.SMTP_URL;
  if (!url) {
    console.log(`[mail] to=${m.to} subject=${JSON.stringify(m.subject)}\n${m.text}\n[/mail]`);
    return;
  }
  transport ??= nodemailer.createTransport(url);
  try {
    await transport.sendMail({ from: process.env.EMAIL_FROM ?? "Schema <no-reply@localhost>", ...m });
  } catch (e) {
    // A mail outage shouldn't break sign-up or invites; the link is still shown or can be resent.
    console.error("[mail] send failed", e);
  }
}
