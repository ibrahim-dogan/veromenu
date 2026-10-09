import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/core/env";

/** Sends an email via SMTP_URL. Without SMTP config the mail is printed to the server log (dev). */
export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const { SMTP_URL, MAIL_FROM } = env();
  if (!SMTP_URL) {
    console.log(`\n📧 [mail:dev] to=${to}\n   subject=${subject}\n   ${text.replace(/\n/g, "\n   ")}\n`);
    return;
  }
  const transport = nodemailer.createTransport(SMTP_URL);
  await transport.sendMail({ from: MAIL_FROM, to, subject, text, html });
}
