import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITb_wedding_rsvp } from "../models/databases/tb_wedding_rsvp.js";
import { ITb_wedding_rsvp_guest } from "../models/databases/tb_wedding_rsvp_guest.js";
import { MaskingUtilities } from "../utils/MaskingUtilities.js";
import { MailerUtilities } from "../utils/MailerUtilities.js";

export interface RsvpGuestPayload {
  name: string;
  email?: string | null;
  contactNumber?: string | null;
  dietaryRestrictions?: string | null;
  mealPreference?: string | null;
}

export interface RsvpPayload {
  name: string;
  email?: string | null;
  contactNumber?: string | null;
  attending: boolean;
  dietaryRestrictions?: string | null;
  mealPreference?: string | null;
  message?: string | null;
  additionalGuestContact: RsvpGuestPayload[];
  // Set by the validator when this name already has an active RSVP — tells
  // submitRsvp to update that row (and replace its guest list) instead of
  // inserting a new one, so re-submitting the same name overwrites the
  // person's previous answer rather than failing as a duplicate.
  existingRsvpId?: number | null;
}

// PDPA retention notice surfaced to guests at collection (POST /rsvp) and at
// lookup (GET /rsvp). NOTE: this text PROMISES deletion — an actual purge job
// must enforce it for the statement to be truthful. That job is not yet
// implemented; see Wedding module TODO.
export const WEDDING_PDPA_NOTICE =
  "Your RSVP details are collected only for this wedding and will be permanently deleted the day after the event.";

// Returned by the name+pin lookup. Shows only the requester's OWN details plus
// whose RSVP they are on ("guest of YK") — never the other guests' details.
export interface RsvpSelfView {
  role: "primary" | "guest";
  // The primary registrant's name when the requester is a guest on someone
  // else's RSVP (e.g. "YK"); null when the requester IS the primary registrant.
  guestOf: string | null;
  you: {
    name: string;
    email: string | null;
    contactNumber: string | null;
    attending: boolean;
    dietaryRestrictions: string | null;
    mealPreference: string | null;
    message: string | null;
  };
  // The registrant's OWN guest names, for editing — populated only when the
  // requester IS the primary registrant (they created and manage these). Empty
  // for a guest requester, who never sees the other guests on the RSVP.
  guestNames: string[];
  notice: string;
}

// Deliberately minimal — unlike RsvpLookupResult (used to pre-fill the RSVP
// form for the person who just typed their own name), this is exposed via an
// unauthenticated public status-check endpoint, so it omits email/contact
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

export class WeddingService {
  constructor(private readonly db: KnexSqlUtilities) {}

  // Step-1 existence check for the RSVP form: given only a name, report whether
  // a primary-registrant RSVP exists and whether it has an email on file (so the
  // UI can offer "forgot PIN → email it", or fall back to "contact the couple").
  // Returns booleans ONLY — never any personal data.
  async checkRsvpExistsByName(name: string): Promise<{ exists: boolean; hasEmail: boolean }> {
    const trimmed = name.trim();
    const rsvp = (
      await this.db.find<ITb_wedding_rsvp>(
        "tb_wedding_rsvp",
        { record_status: "A" },
        {
          limit: 1,
          columns: ["id", "email"],
          extraWhere: (qb) => qb.whereRaw("LOWER(name) = LOWER(?)", [trimmed]),
        },
      )
    )[0];
    return { exists: Boolean(rsvp), hasEmail: Boolean(rsvp?.email) };
  }

  // "Forgot PIN": email the pin to the RSVP's registered address (the only
  // party who can read it). The pin is never returned in the HTTP response.
  async recoverPinByName(name: string): Promise<{ exists: boolean; hasEmail: boolean; sent: boolean }> {
    const trimmed = name.trim();
    const rsvp = (
      await this.db.find<ITb_wedding_rsvp>(
        "tb_wedding_rsvp",
        { record_status: "A" },
        { limit: 1, extraWhere: (qb) => qb.whereRaw("LOWER(name) = LOWER(?)", [trimmed]) },
      )
    )[0];

    if (!rsvp) return { exists: false, hasEmail: false, sent: false };
    if (!rsvp.email) return { exists: true, hasEmail: false, sent: false };

    try {
      await MailerUtilities.sendMail({
        to: rsvp.email,
        subject: "Your wedding RSVP PIN",
        html: `
          <p>Hi <strong>${rsvp.name}</strong>,</p>
          <p>Your RSVP PIN is:</p>
          <h2 style="letter-spacing:0.2em;">${rsvp.pin}</h2>
          <p>Use it to view or edit your RSVP. Please don't share it with anyone.</p>
          <p>— no-reply-awense</p>
        `,
      });
      return { exists: true, hasEmail: true, sent: true };
    } catch {
      return { exists: true, hasEmail: true, sent: false };
    }
  }

  // Locked-down lookup: the requester must prove BOTH their name and the RSVP
  // pin. A pin alone, or a name alone, reveals nothing. On success we return
  // only the requester's own details plus whose RSVP they're on — never the
  // other guests' details. Returns null when the pin doesn't exist or the name
  // doesn't match anyone on that pin's RSVP (caller maps both to "not found",
  // so the two cases are indistinguishable to the client).
  async lookupRsvpByNameAndPin(name: string, pin: string): Promise<RsvpSelfView | null> {
    const rsvp = await this.db.findOne<ITb_wedding_rsvp>("tb_wedding_rsvp", { pin, record_status: "A" });
    if (!rsvp) return null;

    const target = name.trim().toLowerCase();

    const guestRows = await this.db.find<ITb_wedding_rsvp_guest>("tb_wedding_rsvp_guest", {
      rsvp_id: rsvp.id,
      record_status: "A",
    });

    // Primary registrant on this RSVP — gets their own details plus their guest
    // names so the RSVP form can pre-fill for editing.
    if (rsvp.name.trim().toLowerCase() === target) {
      return {
        role: "primary",
        guestOf: null,
        you: {
          name: rsvp.name,
          email: rsvp.email,
          contactNumber: rsvp.contact_number,
          attending: rsvp.attending === 1,
          dietaryRestrictions: rsvp.dietary_restrictions,
          mealPreference: rsvp.meal_preference,
          message: rsvp.message,
        },
        guestNames: guestRows.map((g) => g.name),
        notice: WEDDING_PDPA_NOTICE,
      };
    }

    // Additional guest on this RSVP — only their own details, never the others'.
    const guest = guestRows.find((g) => g.name.trim().toLowerCase() === target);
    if (guest) {
      return {
        role: "guest",
        guestOf: rsvp.name, // "you are a guest of YK"
        you: {
          name: guest.name,
          email: guest.email,
          contactNumber: guest.contact_number,
          attending: rsvp.attending === 1, // attendance is tracked at the RSVP level
          dietaryRestrictions: guest.dietary_restrictions,
          mealPreference: guest.meal_preference,
          message: null, // message is a primary-registrant field only
        },
        guestNames: [],
        notice: WEDDING_PDPA_NOTICE,
      };
    }

    // Pin is valid but the supplied name isn't on this RSVP.
    return null;
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

    let rsvpId: number;
    let pin: string;
    const now = Date.now();

    if (payload.existingRsvpId) {
      rsvpId = payload.existingRsvpId;

      // Pin is assigned once at creation and never reissued — the guest's
      // confirmation code has to stay valid across later edits.
      const existingRow = await this.db.findOne<ITb_wedding_rsvp>("tb_wedding_rsvp", { id: rsvpId });
      pin = existingRow?.pin ?? (await this.generateUniquePin());

      await this.db.update<Partial<ITb_wedding_rsvp>>(
        "tb_wedding_rsvp",
        { id: rsvpId },
        {
          name: payload.name,
          email: payload.email ?? null,
          contact_number: payload.contactNumber ?? null,
          attending: payload.attending ? 1 : 0,
          dietary_restrictions: payload.dietaryRestrictions ?? null,
          meal_preference: payload.mealPreference ?? null,
          message: payload.message ?? null,
          updated_dt: now,
        },
        logEvent,
      );

      // Replace the guest list wholesale rather than trying to diff/merge —
      // matches "overwrite their latest submission" semantics.
      await this.db.update<Partial<ITb_wedding_rsvp_guest>>(
        "tb_wedding_rsvp_guest",
        { rsvp_id: rsvpId, record_status: "A" },
        { record_status: "D" },
        logEvent,
      );
    } else {
      pin = await this.generateUniquePin();

      const rsvp = await this.db.insert<Partial<ITb_wedding_rsvp>, ITb_wedding_rsvp>(
        "tb_wedding_rsvp",
        {
          pin,
          name: payload.name,
          email: payload.email ?? null,
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
      rsvpId = rsvp.id;
    }

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

    return { rsvpId, pin };
  }
}
