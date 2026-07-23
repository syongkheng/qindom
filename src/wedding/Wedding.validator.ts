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
    V.requiredEmail(email, "email", loggingEvent);
    V.requiredBoolean(attending, "attending", loggingEvent);
    V.optionalContactNumber(contactNumber, "contactNumber", loggingEvent);
    V.optionalString(dietaryRestrictions, "dietaryRestrictions", loggingEvent);
    V.optionalString(mealPreference, "mealPreference", loggingEvent);
    V.optionalString(message, "message", loggingEvent);

    // Re-submitting an already-registered email overwrites that person's
    // previous RSVP (see WeddingService.submitRsvp) rather than being
    // rejected as a duplicate.
    const [existing] = await this.db.find<ITb_wedding_rsvp>(
      "tb_wedding_rsvp",
      { email, record_status: "A" },
      { columns: ["id"] },
      loggingEvent,
    );
    loggingEvent?.children?.push(
      existing ? `'email' matches existing RSVP #${existing.id} — will update ${LogEmoji.success}` : `'email' is new ${LogEmoji.success}`,
    );

    const guests: RsvpGuestPayload[] = [];
    if (additionalGuestContact !== undefined && additionalGuestContact !== null) {
      this.validateAdditionalGuestContact(additionalGuestContact, loggingEvent, guests);
    }

    loggingEvent?.children?.push(`RSVP payload validated successfully ${LogEmoji.success}`);

    return {
      name,
      email,
      contactNumber: contactNumber ?? null,
      attending,
      dietaryRestrictions: dietaryRestrictions ?? null,
      mealPreference: mealPreference ?? null,
      message: message ?? null,
      additionalGuestContact: guests,
      existingRsvpId: existing?.id ?? null,
    };
  }

  async findRsvpByEmailQuery(req: Request, loggingEvent?: IRequestLogEvent): Promise<string> {
    const email = req.query.email;
    V.requiredEmail(email, "email", loggingEvent);
    return email as string;
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
        name: name as string,
        email: (email as string | undefined) ?? null,
        contactNumber: (contactNumber as string | undefined) ?? null,
        dietaryRestrictions: (dietaryRestrictions as string | undefined) ?? null,
        mealPreference: (mealPreference as string | undefined) ?? null,
      });
    });
  }
}
