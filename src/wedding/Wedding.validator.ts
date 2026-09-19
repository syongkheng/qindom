import { Request } from "express";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { RsvpGuestPayload, RsvpPayload } from "./Wedding.service.js";
import { ITb_wedding_rsvp } from "../models/databases/tb_wedding_rsvp.js";

export class WeddingValidator {
  constructor(private readonly db: KnexSqlUtilities) {}

  async validateRsvpPayload(req: Request, loggingEvent?: IRequestLogEvent): Promise<RsvpPayload> {
    const {
      name,
      email,
      attending,
      contactNumber,
      dietaryRestrictions,
      mealPreference,
      message,
      additionalGuestContact,
    } = req.body;

    V.requiredString(name, "name", loggingEvent);
    V.optionalEmail(email, "email", loggingEvent);
    V.requiredBoolean(attending, "attending", loggingEvent);
    V.optionalContactNumber(contactNumber, "contactNumber", loggingEvent);
    V.optionalString(dietaryRestrictions, "dietaryRestrictions", loggingEvent);
    V.optionalString(mealPreference, "mealPreference", loggingEvent);
    V.optionalString(message, "message", loggingEvent);

    const trimmedName = (name as string).trim();

    // Re-submitting an already-registered name overwrites that person's
    // previous RSVP (see WeddingService.submitRsvp) rather than being
    // rejected as a duplicate. Matched case-insensitively and trimmed —
    // an exact match previously let trivial variations ("YK" vs "yk" vs
    // "YK " with trailing whitespace) silently create a second row instead
    // of updating the first.
    const existing = (
      await this.db.find<ITb_wedding_rsvp>(
        "tb_wedding_rsvp",
        { record_status: "A" },
        {
          columns: ["id"],
          extraWhere: (qb) => qb.whereRaw("LOWER(name) = LOWER(?)", [trimmedName]),
        },
        loggingEvent,
      )
    )[0];
    loggingEvent?.children?.push(
      existing
        ? `'name' matches existing RSVP #${existing.id} — will update ${LogEmoji.success}`
        : `'name' is new ${LogEmoji.success}`,
    );

    const guests: RsvpGuestPayload[] = [];
    if (additionalGuestContact !== undefined && additionalGuestContact !== null) {
      this.validateAdditionalGuestContact(additionalGuestContact, loggingEvent, guests);
    }

    loggingEvent?.children?.push(`RSVP payload validated successfully ${LogEmoji.success}`);

    return {
      name: trimmedName,
      email: email ?? null,
      contactNumber: contactNumber ?? null,
      attending,
      dietaryRestrictions: dietaryRestrictions ?? null,
      mealPreference: mealPreference ?? null,
      message: message ?? null,
      additionalGuestContact: guests,
      existingRsvpId: existing?.id ?? null,
    };
  }

  async findRsvpByNameQuery(req: Request, loggingEvent?: IRequestLogEvent): Promise<string> {
    const name = req.query.name;
    V.requiredString(name, "name", loggingEvent);
    return name as string;
  }

  // Accepts either `pin` (the 4-digit reservation pin handed back on
  // submit) or `name` (checked against both the primary registrant and
  // guest names) — exactly one of the two, so the caller can't send both
  // and get an ambiguous lookup.
  async validateRsvpStatusQuery(
    req: Request,
    loggingEvent?: IRequestLogEvent,
  ): Promise<{ pin?: string; name?: string }> {
    const { pin, name } = req.query;

    if (pin !== undefined) {
      if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
        loggingEvent?.children?.push(`'pin' must be exactly 4 digits ${LogEmoji.error}`);
        throw new InvalidRequestException("pin", "format");
      }
      loggingEvent?.children?.push(`'pin' validated ${LogEmoji.success}`);
      return { pin };
    }

    if (name !== undefined) {
      V.requiredString(name, "name", loggingEvent);
      return { name: (name as string).trim() };
    }

    loggingEvent?.children?.push(`Either 'pin' or 'name' must be provided ${LogEmoji.error}`);
    throw new InvalidRequestException("pin", "mandatory");
  }

  private validateAdditionalGuestContact(
    contacts: unknown,
    loggingEvent: IRequestLogEvent | undefined,
    out: RsvpGuestPayload[],
  ): void {
    if (!Array.isArray(contacts)) {
      loggingEvent?.children?.push(`additionalGuestContact must be an array ${LogEmoji.error}`);
      throw new InvalidRequestException("additionalGuestContact", "format");
    }

    contacts.forEach((contact, index) => {
      if (typeof contact !== "object" || contact === null || Array.isArray(contact)) {
        loggingEvent?.children?.push(`additionalGuestContact[${index}] format ${LogEmoji.error}`);
        throw new InvalidRequestException(`additionalGuestContact[${index}]`, "format");
      }

      const { name, email, contactNumber, dietaryRestrictions, mealPreference } = contact as Record<string, unknown>;
      const prefix = `additionalGuestContact[${index}]`;

      V.requiredString(name, `${prefix}.name`, loggingEvent);
      V.optionalEmail(email, `${prefix}.email`, loggingEvent);
      V.optionalContactNumber(contactNumber, `${prefix}.contactNumber`, loggingEvent);
      V.optionalString(dietaryRestrictions, `${prefix}.dietaryRestrictions`, loggingEvent);
      V.optionalString(mealPreference, `${prefix}.mealPreference`, loggingEvent);

      loggingEvent?.children?.push(`${prefix} validated ${LogEmoji.success}`);

      out.push({
        name: (name as string).trim(),
        email: (email as string | undefined) ?? null,
        contactNumber: (contactNumber as string | undefined) ?? null,
        dietaryRestrictions: (dietaryRestrictions as string | undefined) ?? null,
        mealPreference: (mealPreference as string | undefined) ?? null,
      });
    });
  }
}
