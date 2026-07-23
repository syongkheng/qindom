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
  email: string;
  contactNumber?: string | null;
  attending: boolean;
  dietaryRestrictions?: string | null;
  mealPreference?: string | null;
  message?: string | null;
  additionalGuestContact: RsvpGuestPayload[];
  // Set by the validator when this email already has an active RSVP — tells
  // submitRsvp to update that row (and replace its guest list) instead of
  // inserting a new one, so re-submitting the same email overwrites the
  // person's previous answer rather than failing as a duplicate.
  existingRsvpId?: number | null;
}

export interface RsvpLookupResult {
  name: string;
  email: string;
  contactNumber: string | null;
  attending: boolean;
  dietaryRestrictions: string | null;
  mealPreference: string | null;
  message: string | null;
  additionalGuestContact: RsvpGuestPayload[];
}

export class WeddingService {
  constructor(private readonly db: KnexSqlUtilities) {}

  async findRsvpByEmail(email: string): Promise<RsvpLookupResult | null> {
    const [rsvp] = await this.db.find<ITb_wedding_rsvp>("tb_wedding_rsvp", { email, record_status: "A" });
    if (!rsvp) return null;

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

  async submitRsvp(payload: RsvpPayload, logContext?: IRequestLogContext): Promise<{ rsvpId: number }> {
    const logEvent = logContext?.events?.[logContext.events.length - 1];

    let rsvpId: number;

    if (payload.existingRsvpId) {
      rsvpId = payload.existingRsvpId;

      await this.db.update<Partial<ITb_wedding_rsvp>>(
        "tb_wedding_rsvp",
        { id: rsvpId },
        {
          name: payload.name,
          contact_number: payload.contactNumber ?? null,
          attending: payload.attending ? 1 : 0,
          dietary_restrictions: payload.dietaryRestrictions ?? null,
          meal_preference: payload.mealPreference ?? null,
          message: payload.message ?? null,
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
      const rsvp = await this.db.insert<Partial<ITb_wedding_rsvp>, ITb_wedding_rsvp>(
        "tb_wedding_rsvp",
        {
          name: payload.name,
          email: payload.email,
          contact_number: payload.contactNumber ?? null,
          attending: payload.attending ? 1 : 0,
          dietary_restrictions: payload.dietaryRestrictions ?? null,
          meal_preference: payload.mealPreference ?? null,
          message: payload.message ?? null,
          record_status: "A",
          created_dt: Date.now(),
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
          created_dt: Date.now(),
        },
        logEvent,
      );
    }

    return { rsvpId };
  }
}
