import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITb_wedding_rsvp } from "../models/databases/tb_wedding_rsvp.js";
import { ITb_wedding_rsvp_guest } from "../models/databases/tb_wedding_rsvp_guest.js";
import { MaskingUtilities } from "../utils/MaskingUtilities.js";
import { MailerUtilities } from "../utils/MailerUtilities.js";
import { renderEventActionButtons, buildRsvpUpdateLink } from "./Wedding.eventLinks.js";
import { renderEmail, emailDetailsPanel, emailSectionTitle, COLORS, SERIF } from "./Wedding.emailTemplate.js";

export interface RsvpGuestPayload {
  name: string;
  email?: string | null;
  contactNumber?: string | null;
  dietaryRestrictions?: string | null;
  mealPreference?: string | null;
}

export interface RsvpPayload {
  name: string;
  email: string;
  contactNumber?: string | null;
  attending: boolean;
  dietaryRestrictions?: string | null;
  mealPreference?: string | null;
  message?: string | null;
  additionalGuestContact: RsvpGuestPayload[];
}

// PDPA retention notice surfaced to guests at collection (POST /rsvp). NOTE: this text PROMISES deletion — an actual purge job
// must enforce it for the statement to be truthful. That job is not yet
// implemented; see Wedding module TODO.
export const WEDDING_PDPA_NOTICE =
  "Your RSVP details are collected only for this wedding and will be permanently deleted the day after the event.";

// Deliberately minimal — this is exposed via an unauthenticated public
// status-check endpoint, so it omits email/contact
// number/dietary info and only ever lists guest *names*. Identified by
// `pin` rather than the underlying auto-increment id — a sequential id
// would make every other guest's record trivially enumerable once one pin
// (id) is known.
export interface RsvpStatusMatch {
  pin: string;
  name: string;
  attending: boolean;
  additionalGuestNames: string[];
  // Set when this match was found via a guest's name rather than the
  // primary registrant's — lets the frontend say "X is on Y's RSVP".
  matchedGuestName?: string | null;
  createdAt: number;
  updatedAt: number;
}

const MEAL_LABELS: Record<string, string> = {
  regular: "No restrictions",
  vegetarian: "Vegetarian",
  halal: "Halal",
};

export class WeddingService {
  constructor(private readonly db: KnexSqlUtilities) {}

  // Step-1 existence check for the RSVP form: given only an email, report whether
  // it already belongs to an RSVP — as a main registrant or as someone's
  // additional guest. Returns booleans ONLY — never any personal data.
  async checkRsvpExistsByEmail(email: string): Promise<{ exists: boolean; hasEmail: boolean }> {
    const trimmed = email.trim();
    const rsvp = (
      await this.db.find<ITb_wedding_rsvp>(
        "tb_wedding_rsvp",
        { record_status: "A" },
        {
          limit: 1,
          columns: ["id", "email"],
          extraWhere: (qb) => qb.whereRaw("LOWER(email) = LOWER(?)", [trimmed]),
        },
      )
    )[0];
    if (rsvp) return { exists: true, hasEmail: Boolean(rsvp.email) };

    // Not a main registrant — they may still have been added as someone's
    // additional guest, which also counts as an existing RSVP for this email.
    const guest = (
      await this.db.find<ITb_wedding_rsvp_guest>(
        "tb_wedding_rsvp_guest",
        { record_status: "A" },
        {
          limit: 1,
          columns: ["id"],
          extraWhere: (qb) => qb.whereRaw("LOWER(email) = LOWER(?)", [trimmed]),
        },
      )
    )[0];
    return { exists: Boolean(guest), hasEmail: Boolean(guest) };
  }

  // Locked-down status check: requires BOTH the guest's name and the 4-digit
  // pin, and the name must be on that pin's RSVP (primary registrant or a
  // listed guest). A pin alone, a name alone, or a name that isn't on that
  // pin's RSVP returns null — so the pin can no longer be used on its own to
  // reveal whether/how someone RSVP'd. Names in the result stay masked.
  async findRsvpStatusByNameAndPin(name: string, pin: string): Promise<RsvpStatusMatch | null> {
    const rsvp = await this.db.findOne<ITb_wedding_rsvp>("tb_wedding_rsvp", { pin, record_status: "A" });
    if (!rsvp) return null;

    const target = name.trim().toLowerCase();

    // Primary registrant on this RSVP.
    if (rsvp.name.trim().toLowerCase() === target) {
      return this.toStatusMatch(rsvp);
    }

    // A listed guest on this RSVP.
    const guestRows = await this.db.find<ITb_wedding_rsvp_guest>("tb_wedding_rsvp_guest", {
      rsvp_id: rsvp.id,
      record_status: "A",
    });
    const guest = guestRows.find((g) => g.name.trim().toLowerCase() === target);
    if (guest) {
      const match = await this.toStatusMatch(rsvp);
      match.matchedGuestName = MaskingUtilities.maskName(guest.name);
      return match;
    }

    // Pin is valid but the supplied name isn't on this RSVP.
    return null;
  }

  private async toStatusMatch(rsvp: ITb_wedding_rsvp): Promise<RsvpStatusMatch> {
    const guestRows = await this.db.find<ITb_wedding_rsvp_guest>("tb_wedding_rsvp_guest", {
      rsvp_id: rsvp.id,
      record_status: "A",
    });

    // PDPA: this is an unauthenticated public status lookup, so names are
    // masked before they leave the server (see MaskingUtilities.maskName).
    return {
      pin: rsvp.pin,
      name: MaskingUtilities.maskName(rsvp.name),
      attending: rsvp.attending === 1,
      additionalGuestNames: guestRows.map((guest) => MaskingUtilities.maskName(guest.name)),
      createdAt: rsvp.created_dt,
      updatedAt: rsvp.updated_dt,
    };
  }

  // 4 digits gives 10,000 possible pins — collisions are effectively
  // impossible at wedding-guest-list scale, but this still guards against
  // one rather than assuming it away.
  private async generateUniquePin(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      const existing = await this.db.findOne<ITb_wedding_rsvp>("tb_wedding_rsvp", { pin });
      if (!existing) return pin;
    }
    throw new Error("Failed to generate a unique RSVP pin");
  }

  async submitRsvp(payload: RsvpPayload, logContext?: IRequestLogContext): Promise<{ rsvpId: number; pin: string }> {
    const logEvent = logContext?.events?.[logContext.events.length - 1];

    const now = Date.now();

    // Re-submitting an already-registered email replaces that person's previous
    // RSVP: every active row for the email (and its guests) is soft-deleted and
    // a fresh row is inserted below, so earlier answers stay on record as 'D'.
    // Matched case-insensitively and trimmed, so "A@x.com" and "a@x.com " are
    // the same person.
    const previous = await this.db.find<ITb_wedding_rsvp>(
      "tb_wedding_rsvp",
      { record_status: "A" },
      {
        columns: ["id"],
        extraWhere: (qb) => qb.whereRaw("LOWER(email) = LOWER(?)", [payload.email.trim()]),
      },
      logEvent,
    );
    for (const { id } of previous) {
      await this.db.update<Partial<ITb_wedding_rsvp>>(
        "tb_wedding_rsvp",
        { id },
        { record_status: "D", updated_dt: now },
        logEvent,
      );
      await this.db.update<Partial<ITb_wedding_rsvp_guest>>(
        "tb_wedding_rsvp_guest",
        { rsvp_id: id, record_status: "A" },
        { record_status: "D" },
        logEvent,
      );
    }

    // The same email may also be listed as an additional guest on someone
    // else's RSVP. They're now answering for themselves, so that guest entry is
    // soft-deleted and they get their own main row below.
    const guestEntries = await this.db.find<ITb_wedding_rsvp_guest>(
      "tb_wedding_rsvp_guest",
      { record_status: "A" },
      {
        columns: ["id"],
        extraWhere: (qb) => qb.whereRaw("LOWER(email) = LOWER(?)", [payload.email.trim()]),
      },
      logEvent,
    );
    for (const { id } of guestEntries) {
      await this.db.update<Partial<ITb_wedding_rsvp_guest>>(
        "tb_wedding_rsvp_guest",
        { id },
        { record_status: "D" },
        logEvent,
      );
    }

    // A new row gets a new pin — the soft-deleted row keeps its own (the pin
    // column is unique across deleted rows too).
    const pin = await this.generateUniquePin();

    const rsvp = await this.db.insert<Partial<ITb_wedding_rsvp>, ITb_wedding_rsvp>(
      "tb_wedding_rsvp",
      {
        pin,
        name: payload.name,
        email: payload.email,
        contact_number: payload.contactNumber ?? null,
        attending: payload.attending ? 1 : 0,
        dietary_restrictions: payload.dietaryRestrictions ?? null,
        meal_preference: payload.mealPreference ?? null,
        message: payload.message ?? null,
        record_status: "A",
        created_dt: now,
        updated_dt: now,
      },
      logEvent,
    );
    const rsvpId = rsvp.id;

    for (const guest of payload.additionalGuestContact) {
      await this.db.insert<Partial<ITb_wedding_rsvp_guest>, ITb_wedding_rsvp_guest>(
        "tb_wedding_rsvp_guest",
        {
          rsvp_id: rsvpId,
          name: guest.name,
          email: guest.email ?? null,
          contact_number: guest.contactNumber ?? null,
          dietary_restrictions: guest.dietaryRestrictions ?? null,
          meal_preference: guest.mealPreference ?? null,
          record_status: "A",
          created_dt: now,
        },
        logEvent,
      );
    }

    // Fire-and-forget: a mail failure (SMTP down, bad address) must never fail
    // or delay an RSVP that has already been saved.
    void this.sendConfirmationEmail(payload, pin).catch((err) => {
      console.error(`Failed to send RSVP confirmation email for RSVP #${rsvpId}:`, err);
    });

    // Guests who were given an email get their own notice. Skip the submitter's
    // own address and repeats, so one inbox never gets two emails.
    const notified = new Set([payload.email.trim().toLowerCase()]);
    for (const guest of payload.additionalGuestContact) {
      const guestEmail = guest.email?.trim();
      if (!guestEmail || notified.has(guestEmail.toLowerCase())) continue;
      notified.add(guestEmail.toLowerCase());
      void this.sendGuestConfirmationEmail(payload, guest, guestEmail).catch((err) => {
        console.error(`Failed to send RSVP guest email for RSVP #${rsvpId}:`, err);
      });
    }

    return { rsvpId, pin };
  }

  // Sent to an additional guest: tells them who RSVP'd on their behalf and what
  // was recorded. No reservation ID — that belongs to the main submitter.
  private async sendGuestConfirmationEmail(
    payload: RsvpPayload,
    guest: RsvpGuestPayload,
    to: string,
  ): Promise<void> {
    const esc = (value: string) => MailerUtilities.escapeHtml(value);
    const submitter = esc(payload.name);

    const p = (html: string) =>
      `<p style="margin:0 0 14px;font-family:${SERIF};">${html}</p>`;

    await MailerUtilities.sendMail({
      to,
      subject: `Yong Kheng & Jessica: We've received your RSVP from ${payload.name}`,
      html: renderEmail({
        heading: "We've received your RSVP",
        bodyHtml: `
          ${p(`Hi <strong>${esc(guest.name)}</strong>,`)}
          ${p(`We've received your RSVP from <strong>${submitter}</strong>, who added you as a guest.`)}
          ${p(
            payload.attending
              ? "You're down as attending — we can't wait to celebrate with you!"
              : `${submitter} let us know you won't be able to make it. You'll be missed.`,
          )}
          ${
            payload.attending
              ? emailSectionTitle("Your details") +
                emailDetailsPanel([
                  [
                    "Meal preference",
                    guest.mealPreference ? MEAL_LABELS[guest.mealPreference] ?? esc(guest.mealPreference) : "—",
                  ],
                ])
              : ""
          }
          ${payload.attending ? renderEventActionButtons() : ""}
          ${p(`If anything needs to change, please let ${submitter} know — they can update the RSVP for everyone.`)}
        `,
      }),
    });
  }

  private async sendConfirmationEmail(payload: RsvpPayload, pin: string): Promise<void> {
    const esc = (value: string) => MailerUtilities.escapeHtml(value);
    const meal = (value?: string | null) => (value ? MEAL_LABELS[value] ?? esc(value) : "—");

    const updateLink = buildRsvpUpdateLink();
    const p = (html: string) =>
      `<p style="margin:0 0 14px;font-family:${SERIF};">${html}</p>`;
    const muted = (html: string) =>
      `<p style="margin:0 0 14px;font-family:${SERIF};font-size:15px;color:${COLORS.textMuted};">${html}</p>`;

    const details: Array<[string, string]> = [["Attending", payload.attending ? "Yes" : "No"]];
    if (payload.attending) details.push(["Meal preference", meal(payload.mealPreference)]);
    if (payload.contactNumber) details.push(["Contact number", esc(payload.contactNumber)]);
    if (payload.message) details.push(["Message", esc(payload.message)]);

    await MailerUtilities.sendMail({
      to: payload.email,
      subject: payload.attending
        ? "Yong Kheng & Jessica: We've received your RSVP — see you there!"
        : "Yong Kheng & Jessica: We've received your RSVP",
      html: renderEmail({
        heading: payload.attending ? "See you there!" : "We've received your RSVP",
        bodyHtml: `
          ${p(`Hi <strong>${esc(payload.name)}</strong>,`)}
          ${p(
            payload.attending
              ? "Thank you for your RSVP — we can't wait to celebrate with you!"
              : "Thank you for letting us know. We're sorry you can't make it, and you'll be missed.",
          )}
          ${emailSectionTitle("Your response")}
          ${emailDetailsPanel(details)}
          ${
            payload.additionalGuestContact.length > 0
              ? emailSectionTitle("Additional guests") +
                emailDetailsPanel(
                  payload.additionalGuestContact.map((g): [string, string] => [esc(g.name), meal(g.mealPreference)]),
                )
              : ""
          }
          ${payload.attending ? renderEventActionButtons() : ""}
          ${p(
            `Need to change something? Just ${
              updateLink
                ? `<a href="${updateLink.replace(/&/g, "&amp;")}" style="color:${COLORS.red};font-weight:600;">submit the RSVP form again</a>`
                : "submit the RSVP form again"
            } with the same email — your latest response replaces the previous one.`,
          )}
          ${muted("If you did not submit this RSVP, please contact us and we will do our best to help you.")}
        `,
      }),
    });
  }
}
