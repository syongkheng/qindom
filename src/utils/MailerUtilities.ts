import nodemailer, { Transporter } from "nodemailer";

/** Gmail account + app password, from .env (`SMTP_USER`, `SMTP_PASS`). Read lazily, on call (see config/README.md). */
const SMTP_SERVICE = "gmail";
const DEFAULT_FROM_NAME = "no-reply";
/** Characters that would break out of the quoted From display name (or inject a header). */
const FROM_NAME_UNSAFE = /["\r\n]/g;

export interface MailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  /** Display name for the From header (address is always SMTP_USER). Defaults to "no-reply". */
  fromName?: string;
  replyTo?: string;
}

let transporter: Transporter | null = null;

/** Built on first send, after index.ts has loaded the env file. */
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    service: SMTP_SERVICE,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

/** `"Name" <SMTP_USER>` with the name stripped of quotes and line breaks. */
export function formatFromHeader(fromName: string | undefined, address: string | undefined): string {
  return `"${(fromName ?? DEFAULT_FROM_NAME).replace(FROM_NAME_UNSAFE, "")}" <${address}>`;
}

/**
 * Outbound email (OTP, password notices, wedding RSVP, PDCA enquiries). A static class so tests
 * can replace `sendMail`; content comes from pure `xyzMail(...) → MailOptions` builders.
 */
export class MailerUtilities {
  static async sendMail(options: MailOptions): Promise<void> {
    await getTransporter().sendMail({
      from: formatFromHeader(options.fromName, process.env.SMTP_USER),
      replyTo: options.replyTo,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }

  /** Escape user-supplied text (e.g. usernames) before interpolating it into an html body. */
  static escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
