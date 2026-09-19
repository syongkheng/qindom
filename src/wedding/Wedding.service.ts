import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITb_wedding_rsvp } from "../models/databases/tb_wedding_rsvp.js";
import { ITb_wedding_rsvp_guest } from "../models/databases/tb_wedding_rsvp_guest.js";

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

export interface RsvpLookupResult {
  name: string;
  email: string | null;
  contactNumber: string | null;
  attending: boolean;
  dietaryRestrictions: string | null;
  mealPreference: string | null;
  message: string | null;
  additionalGuestContact: RsvpGuestPayload[];
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

  // Name isn't unique, so this just takes whichever active RSVP matches
  // first — good enough for a convenience pre-fill lookup. Matched
  // case-insensitively and trimmed so "YK" and "yk " resolve to the same
  // record instead of missing each other.
  async findRsvpByName(name: string): Promise<RsvpLookupResult | null> {
    const rsvp = (
      await this.db.find<ITb_wedding_rsvp>(
        "tb_wedding_rsvp",
        { record_status: "A" },
        { limit: 1, extraWhere: (qb) => qb.whereRaw("LOWER(name) = LOWER(?)", [name.trim()]) },
      )
    )[0];
    return rsvp ? this.toLookupResult(rsvp) : null;
  }

  private async toLookupResult(rsvp: ITb_wedding_rsvp): Promise<RsvpLookupResult> {
    const guestRows = await this.db.find<ITb_wedding_rsvp_guest>("tb_wedding_rsvp_guest", {
      rsvp_id: rsvp.id,
      record_status: "A",
    });

    return {
      name: rsvp.name,
      email: rsvp.email,
      contactNumber: rsvp.contact_number,
      attending: rsvp.attending === 1,
      dietaryRestrictions: rsvp.dietary_restrictions,
      mealPreference: rsvp.meal_preference,
      message: rsvp.message,
      additionalGuestContact: guestRows.map((guest) => ({
        name: guest.name,
        email: guest.email,
        contactNumber: guest.contact_number,
        dietaryRestrictions: guest.dietary_restrictions,
        mealPreference: guest.meal_preference,
      })),
    };
  }

  async findRsvpStatusByPin(pin: string): Promise<RsvpStatusMatch | null> {
    const rsvp = await this.db.findOne<ITb_wedding_rsvp>("tb_wedding_rsvp", { pin, record_status: "A" });
    return rsvp ? this.toStatusMatch(rsvp) : null;
  }

  // A name can match the primary registrant on one RSVP and/or a guest
  // listed on another (or the same) RSVP — collects every distinct RSVP
  // that comes up either way, case-insensitively.
  async findRsvpStatusByName(name: string): Promise<RsvpStatusMatch[]> {
    const trimmed = name.trim();
    const results = new Map<number, RsvpStatusMatch>();

    const primaryMatches = await this.db.find<ITb_wedding_rsvp>(
      "tb_wedding_rsvp",
      { record_status: "A" },
      { extraWhere: (qb) => qb.whereRaw("LOWER(name) = LOWER(?)", [trimmed]) },
    );
    for (const rsvp of primaryMatches) {
      results.set(rsvp.id, await this.toStatusMatch(rsvp));
    }

    const guestMatches = await this.db.find<ITb_wedding_rsvp_guest>(
      "tb_wedding_rsvp_guest",
      { record_status: "A" },
      { extraWhere: (qb) => qb.whereRaw("LOWER(name) = LOWER(?)", [trimmed]) },
    );
    for (const guest of guestMatches) {
      if (results.has(guest.rsvp_id)) continue;
      const rsvp = await this.db.findOne<ITb_wedding_rsvp>("tb_wedding_rsvp", {
        id: guest.rsvp_id,
        record_status: "A",
      });
      if (!rsvp) continue;
      const match = await this.toStatusMatch(rsvp);
      match.matchedGuestName = guest.name;
      results.set(rsvp.id, match);
    }

    return Array.from(results.values());
  }

  private async toStatusMatch(rsvp: ITb_wedding_rsvp): Promise<RsvpStatusMatch> {
    const guestRows = await this.db.find<ITb_wedding_rsvp_guest>("tb_wedding_rsvp_guest", {
      rsvp_id: rsvp.id,
      record_status: "A",
    });

    return {
      pin: rsvp.pin,
      name: rsvp.name,
      attending: rsvp.attending === 1,
      additionalGuestNames: guestRows.map((guest) => guest.name),
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
