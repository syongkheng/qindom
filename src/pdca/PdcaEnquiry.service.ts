import { MailerUtilities, MailOptions } from "../utils/MailerUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { APP_TIMEZONE } from "../constants/Locale.js";
import { PdcaEnquiryBody } from "./PdcaEnquiry.types.js";

/**
 * PDCA website enquiry form (dental-directory M21), POST /pdca/enquiry.
 * Nothing is stored: qindom emails the lab and sends the visitor an automatic reply.
 */

/** Analytics system whose `allowed_origins` gate this form. */
export const PDCA_ENQUIRY_SYSTEM = "dental-directory";

const LAB_EMAIL_ENV = "PDCA_ENQUIRY_TO";
const LAB_EMAIL_DEFAULT = "admin@pdcadental.com";
const SUBJECT_NAME_MAX_LENGTH = 80;

/** Shown in the auto-reply. */
const LAB = {
  name: "Patrick Dental Ceramic Arts",
  legalName: "Patrick Dental Ceramic Arts Pte Ltd",
  phone: "+65 6842 3371",
  address: "33 Ubi Avenue 3, #08-52/53, Vertex Tower A, Singapore 408868",
} as const;

const CONSENT_LINE = "The sender agreed to PDCA using these details to reply.";

const esc = MailerUtilities.escapeHtml;
const nl2br = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

/** Read lazily, on call (see config/README.md). */
export function getLabEmail(): string {
  return process.env[LAB_EMAIL_ENV] || LAB_EMAIL_DEFAULT;
}

export const isSpam = (enquiry: Pick<PdcaEnquiryBody, "website">) => enquiry.website.trim() !== "";

/** Notification to the lab. Reply-To is the visitor when they gave an email. */
export function notificationMail(e: PdcaEnquiryBody, to: string, receivedAt = new Date()): MailOptions {
  const when = receivedAt.toLocaleString("en-SG", { timeZone: APP_TIMEZONE });
  const rows: [string, string][] = [
    ["Name", e.name],
    ["Clinic or institution", e.clinic || "—"],
    ["Phone", e.phone || "—"],
    ["Email", e.email || "—"],
    ["Received", `${when} (Singapore)`],
  ];
  return {
    to,
    // Header-injection safe: newlines removed.
    subject: `Website enquiry from ${e.name.replace(/[\r\n]/g, " ").slice(0, SUBJECT_NAME_MAX_LENGTH)}`,
    fromName: "PDCA website",
    replyTo: e.email || undefined,
    text: `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${e.message}\n\n${CONSENT_LINE}`,
    html:
      `<table cellpadding="4">${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table>` +
      `<p>${nl2br(e.message)}</p><p style="color:#666">${CONSENT_LINE}</p>`,
  };
}

/** Automatic reply to the visitor (only when they gave an email). Reply-To is the lab. */
export function autoReplyMail(e: PdcaEnquiryBody, labEmail: string): MailOptions | null {
  if (!e.email) return null;
  const first = e.name.split(/\s+/)[0] || e.name;
  const thanks = `Thank you for contacting ${LAB.name}. We have received your message and aim to reply the same working day.`;
  const urgent = `If it's urgent, WhatsApp or call us on ${LAB.phone}.`;
  return {
    to: e.email,
    subject: `We've received your message — ${LAB.name}`,
    fromName: LAB.name,
    replyTo: labEmail,
    text: `Hi ${first},\n\n${thanks}\n\n${urgent}\n\n${LAB.legalName}\n${LAB.address}\n\nYour message:\n${e.message}`,
    html:
      `<p>Hi ${esc(first)},</p><p>${thanks}</p><p>${urgent}</p>` +
      `<p>${LAB.legalName}<br>${LAB.address}</p>` +
      `<p style="color:#666">Your message:<br>${nl2br(e.message)}</p>`,
  };
}

export class PdcaEnquiryService {
  /**
   * Emails the lab, then auto-replies to the visitor. A failed lab email is an error;
   * a failed auto-reply is ignored (the lab already has the message).
   * Honeypot hits are dropped silently.
   */
  async submit(enquiry: PdcaEnquiryBody, logContext?: IRequestLogContext): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Send PDCA enquiry");
    if (isSpam(enquiry)) {
      if (event) event.detail = "honeypot filled, dropped";
      return;
    }
    const labEmail = getLabEmail();
    await MailerUtilities.sendMail(notificationMail(enquiry, labEmail));
    const reply = autoReplyMail(enquiry, labEmail);
    const replySent = reply
      ? await MailerUtilities.sendMail(reply).then(
          () => true,
          () => false,
        )
      : false;
    if (event)
      event.detail = `lab notified; auto-reply ${reply ? (replySent ? "sent" : "failed") : "skipped (no email)"}`;
  }
}
