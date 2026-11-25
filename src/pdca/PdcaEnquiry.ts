import { z } from "zod";
import { MailerUtilities } from "../utils/MailerUtilities.js";

/**
 * PDCA website enquiry form (dental-directory M21) — POST /pdca/enquiry.
 * Body: { name, clinic, phone, email, message, consent: true, website (honeypot, must be empty) }
 * Nothing is stored: qindom emails the lab and sends the visitor an automatic reply.
 */

export const PDCA_ENQUIRY_SYSTEM = "dental-directory";
export const PDCA_ENQUIRY_TO_DEFAULT = "admin@pdcadental.com";

const PHONE = /^[+()\-\s\d]{8,20}$/;

export const EnquirySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    clinic: z.string().trim().max(160).default(""),
    phone: z.string().trim().max(20).default(""),
    email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
    message: z.string().trim().min(1).max(4000),
    consent: z.literal(true),
    website: z.string().max(200).default(""),
  })
  .refine((e) => e.phone !== "" || e.email !== "", { path: ["contact"], message: "phone or email required" })
  .refine((e) => e.phone === "" || PHONE.test(e.phone), { path: ["phone"], message: "invalid phone" });

export type Enquiry = z.infer<typeof EnquirySchema>;

export const isSpam = (e: Pick<Enquiry, "website">) => e.website.trim() !== "";

const esc = MailerUtilities.escapeHtml;
const nl2br = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

/** Notification to the lab. Reply-To is the visitor when they gave an email. */
export function notificationMail(e: Enquiry, to: string, receivedAt = new Date()) {
  const when = receivedAt.toLocaleString("en-SG", { timeZone: "Asia/Singapore" });
  const rows: [string, string][] = [
    ["Name", e.name],
    ["Clinic or institution", e.clinic || "—"],
    ["Phone", e.phone || "—"],
    ["Email", e.email || "—"],
    ["Received", `${when} (Singapore)`],
  ];
  return {
    to,
    subject: `Website enquiry from ${e.name.replace(/[\r\n]/g, " ").slice(0, 80)}`,
    fromName: "PDCA website",
    replyTo: e.email || undefined,
    text: `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${e.message}\n\nThe sender agreed to PDCA using these details to reply.`,
    html:
      `<table cellpadding="4">${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table>` +
      `<p>${nl2br(e.message)}</p><p style="color:#666">The sender agreed to PDCA using these details to reply.</p>`,
  };
}

/** Automatic reply to the visitor (only when they gave an email). */
export function autoReplyMail(e: Enquiry, labEmail: string) {
  if (!e.email) return null;
  const first = e.name.split(/\s+/)[0] || e.name;
  const text =
    `Hi ${first},\n\nThank you for contacting Patrick Dental Ceramic Arts. We have received your message and aim to reply the same working day.\n\n` +
    `If it's urgent, WhatsApp or call us on +65 6842 3371.\n\nPatrick Dental Ceramic Arts Pte Ltd\n33 Ubi Avenue 3, #08-52/53, Vertex Tower A, Singapore 408868\n\n` +
    `Your message:\n${e.message}`;
  return {
    to: e.email,
    subject: "We've received your message — Patrick Dental Ceramic Arts",
    fromName: "Patrick Dental Ceramic Arts",
    replyTo: labEmail,
    text,
    html:
      `<p>Hi ${esc(first)},</p><p>Thank you for contacting Patrick Dental Ceramic Arts. We have received your message and aim to reply the same working day.</p>` +
      `<p>If it's urgent, WhatsApp or call us on +65 6842 3371.</p>` +
      `<p>Patrick Dental Ceramic Arts Pte Ltd<br>33 Ubi Avenue 3, #08-52/53, Vertex Tower A, Singapore 408868</p>` +
      `<p style="color:#666">Your message:<br>${nl2br(e.message)}</p>`,
  };
}

/** Request-log payload without personal data (field lengths only). */
export function loggablePayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) => [
      k,
      typeof v === "string" ? `[${v.length} chars]` : typeof v === "boolean" ? v : "[omitted]",
    ]),
  );
}
