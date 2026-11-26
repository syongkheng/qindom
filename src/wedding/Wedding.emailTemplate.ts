// The RSVP confirmation emails. The HTML shell is styled after the website's theme
// (see jessikheng/src/theme.js): warm cream page, white card, gold accents,
// sage green details and a serif face.
//
// Email clients ignore most CSS, so this is table-based with inline styles.
// Web fonts rarely load in mail clients, so Georgia is the safe serif fallback.
//
// Escaping: `emailSectionTitle`, `emailDetailsPanel` and the builders below take PLAIN text and
// escape it themselves; only `renderEmail`'s `bodyHtml` and `p()` take HTML.

import { APP_TIMEZONE } from "../constants/Locale.js";
import { MailerUtilities, MailOptions } from "../utils/MailerUtilities.js";
import { buildEventLinks, buildRsvpUpdateLink } from "./Wedding.eventLinks.js";
import { ReplacedRsvp, WeddingRsvpBody, WeddingRsvpGuestBody } from "./Wedding.types.js";

export const COLORS = {
  page: "#fdf8f3",
  card: "#ffffff",
  gold: "#c9a15a",
  goldDark: "#9c7a3e",
  sage: "#8a9a5b",
  sageDark: "#5f6d3c",
  text: "#3d3733",
  textMuted: "#7a7168",
  red: "#A52A2A",
  redTint: "#fbefee",
};

export const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

const SUBJECT_PREFIX = "Yong Kheng & Jessica";
const NO_VALUE = "—";

/** Stored meal values the RSVP form sends; anything else is shown as typed. */
const MEAL_LABELS: Record<string, string> = {
  regular: "No restrictions",
  vegetarian: "Vegetarian",
  halal: "Halal",
};

const esc = MailerUtilities.escapeHtml;
/** Header-injection safe: subjects never carry a line break. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");
const mealLabel = (value: string | null) => (value ? (MEAL_LABELS[value] ?? value) : NO_VALUE);
const p = (html: string) => `<p style="margin:0 0 14px;font-family:${SERIF};">${html}</p>`;
const muted = (html: string) =>
  `<p style="margin:0 0 14px;font-family:${SERIF};font-size:15px;color:${COLORS.textMuted};">${html}</p>`;

const ornament = (glyph = "&#10086;") => `
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
    <tr>
      <td style="width:60px;border-top:1px solid ${COLORS.gold};font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;color:${COLORS.goldDark};font-size:20px;line-height:1;">${glyph}</td>
      <td style="width:60px;border-top:1px solid ${COLORS.gold};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>`;

/** A small gold-ruled heading for a block inside the card (plain text). */
export const emailSectionTitle = (label: string) => `
  <p style="margin:24px 0 8px;font-family:${SERIF};font-size:13px;letter-spacing:0.2em;
            text-transform:uppercase;color:${COLORS.goldDark};font-weight:700;">${esc(label)}</p>`;

/** Label/value rows (plain text) on a cream panel with a sage accent bar. */
export const emailDetailsPanel = (rows: Array<[string, string]>) => `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
         style="background:${COLORS.page};border-left:3px solid ${COLORS.sage};border-radius:4px;">
    <tr><td style="padding:12px 16px;">
      ${rows
        .map(
          ([label, value]) => `
        <p style="margin:4px 0;font-family:${SERIF};font-size:16px;color:${COLORS.text};">
          <span style="color:${COLORS.textMuted};">${esc(label)}:</span> <strong>${esc(value)}</strong>
        </p>`,
        )
        .join("")}
    </td></tr>
  </table>`;

/** The full email document. `heading` is plain text; `bodyHtml` is trusted HTML. */
export function renderEmail(opts: { heading: string; bodyHtml: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${COLORS.page};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${COLORS.page};">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
               style="max-width:560px;background:${COLORS.card};border-radius:8px;overflow:hidden;
                      border:1px solid #efe6da;box-shadow:0 4px 16px rgba(0,0,0,0.06);">

          <tr><td style="height:6px;background:${COLORS.sage};font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr><td align="center" style="padding:32px 24px 8px;">
            <p style="margin:0;font-family:${SERIF};font-size:12px;letter-spacing:0.3em;
                      text-transform:uppercase;color:${COLORS.goldDark};">Wedding of</p>
            <h1 style="margin:10px 0 4px;font-family:${SERIF};font-size:34px;font-weight:600;
                       color:${COLORS.text};">Yong Kheng &amp; Jessica</h1>
            <p style="margin:0 0 16px;font-family:${SERIF};font-size:15px;color:${COLORS.textMuted};">
              Sunday, 28 March 2027 &middot; SAFRA Mount Faber Club
            </p>
            ${ornament()}
          </td></tr>

          <tr><td style="padding:16px 32px 8px;font-family:${SERIF};font-size:17px;line-height:1.6;color:${COLORS.text};">
            <h2 style="margin:8px 0 16px;font-family:${SERIF};font-size:22px;font-weight:600;
                       color:${COLORS.sageDark};text-align:center;">${esc(opts.heading)}</h2>
            ${opts.bodyHtml}
          </td></tr>

          <tr><td align="center" style="padding:8px 24px 28px;">
            ${ornament("&#10047;")}
            <p style="margin:12px 0 0;font-family:${SERIF};font-size:13px;color:${COLORS.textMuted};">
              &mdash; no-reply
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** "Add to Calendar" / "Get Directions" / "Open Website" buttons, stacked full width. */
export function renderEventActionButtons(): string {
  const links = buildEventLinks();
  const buttons: Array<[string, string]> = [
    ["Add to Calendar", links.calendar],
    ["Get Directions", links.directions],
  ];
  if (links.website) buttons.push(["Open Website", links.website]);

  const rows = buttons
    .map(
      ([label, href]) => `
        <tr><td style="padding:0 0 10px;">
          <a href="${esc(href)}" target="_blank"
             style="display:block;padding:12px 18px;background:${COLORS.red};color:#ffffff;text-align:center;
                    text-decoration:none;border-radius:4px;font-weight:600;font-size:15px;
                    font-family:${SERIF};letter-spacing:0.05em;">
            ${esc(label)}
          </a>
        </td></tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 8px;">${rows}</table>`;
}

/** e.g. "3 Nov 2026, 14:05 (SGT)". */
export const formatSgDateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " (SGT)";

/** Red "Your RSVP was updated" box opening the submitter's confirmation (tamper alert). */
export function renderReplacedNotice(replaced: ReplacedRsvp): string {
  const what =
    replaced.kind === "guest"
      ? "This email was previously listed as a guest on another RSVP — this response replaces that entry."
      : replaced.at > 0
        ? `This replaces the RSVP previously recorded for this email on <strong>${formatSgDateTime(replaced.at)}</strong>.`
        : "This replaces the RSVP previously recorded for this email.";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="margin:0 0 16px;background:${COLORS.redTint};border-left:3px solid ${COLORS.red};border-radius:4px;">
      <tr><td style="padding:12px 16px;font-family:${SERIF};font-size:16px;color:${COLORS.text};">
        <p style="margin:0 0 6px;font-weight:700;color:${COLORS.red};">Your RSVP was updated</p>
        <p style="margin:0;">${what} If you didn't make this change, please contact us so we can restore your response.</p>
      </td></tr>
    </table>`;
}

/** Confirmation to the submitter: their PIN-less summary, guests, and the tamper alert when `replaced` is set. */
export function rsvpConfirmationMail(rsvp: WeddingRsvpBody, replaced: ReplacedRsvp | null): MailOptions {
  const updateLink = buildRsvpUpdateLink();
  const details: Array<[string, string]> = [["Attending", rsvp.attending ? "Yes" : "No"]];
  if (rsvp.attending) details.push(["Meal preference", mealLabel(rsvp.mealPreference)]);
  if (rsvp.contactNumber) details.push(["Contact number", rsvp.contactNumber]);
  if (rsvp.message) details.push(["Message", rsvp.message]);

  const resubmit = updateLink
    ? `<a href="${esc(updateLink)}" style="color:${COLORS.red};font-weight:600;">submit the RSVP form again</a>`
    : "submit the RSVP form again";

  return {
    to: rsvp.email,
    subject: rsvp.attending
      ? `${SUBJECT_PREFIX}: We've received your RSVP — see you there!`
      : `${SUBJECT_PREFIX}: We've received your RSVP`,
    html: renderEmail({
      heading: rsvp.attending ? "See you there!" : "We've received your RSVP",
      bodyHtml: `
          ${p(`Hi <strong>${esc(rsvp.name)}</strong>,`)}
          ${replaced ? renderReplacedNotice(replaced) : ""}
          ${p(
            rsvp.attending
              ? "Thank you for your RSVP — we can't wait to celebrate with you!"
              : "Thank you for letting us know. We're sorry you can't make it, and you'll be missed.",
          )}
          ${emailSectionTitle("Your response")}
          ${emailDetailsPanel(details)}
          ${
            rsvp.additionalGuestContact.length > 0
              ? emailSectionTitle("Additional guests") +
                emailDetailsPanel(
                  rsvp.additionalGuestContact.map((g): [string, string] => [g.name, mealLabel(g.mealPreference)]),
                )
              : ""
          }
          ${rsvp.attending ? renderEventActionButtons() : ""}
          ${p(`Need to change something? Just ${resubmit} with the same email — your latest response replaces the previous one.`)}
          ${muted("If you did not submit this RSVP, please contact us and we will do our best to help you.")}
        `,
    }),
  };
}

/** Sent to an additional guest who was given an email: who RSVP'd for them and what was recorded. No PIN. */
export function rsvpGuestMail(rsvp: WeddingRsvpBody, guest: WeddingRsvpGuestBody, to: string): MailOptions {
  const submitter = esc(rsvp.name);
  return {
    to,
    subject: `${SUBJECT_PREFIX}: We've received your RSVP from ${oneLine(rsvp.name)}`,
    html: renderEmail({
      heading: "We've received your RSVP",
      bodyHtml: `
          ${p(`Hi <strong>${esc(guest.name)}</strong>,`)}
          ${p(`We've received your RSVP from <strong>${submitter}</strong>, who added you as a guest.`)}
          ${p(
            rsvp.attending
              ? "You're down as attending — we can't wait to celebrate with you!"
              : `${submitter} let us know you won't be able to make it. You'll be missed.`,
          )}
          ${
            rsvp.attending
              ? emailSectionTitle("Your details") +
                emailDetailsPanel([["Meal preference", mealLabel(guest.mealPreference)]]) +
                renderEventActionButtons()
              : ""
          }
          ${p(`If anything needs to change, please let ${submitter} know — they can update the RSVP for everyone.`)}
        `,
    }),
  };
}
