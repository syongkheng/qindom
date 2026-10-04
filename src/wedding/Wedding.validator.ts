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

    const trimmedName = (name as string).trim();
    const trimmedEmail = (email as string).trim();

    const guests: RsvpGuestPayload[] = [];
    if (additionalGuestContact !== undefined && additionalGuestContact !== null) {
      this.validateAdditionalGuestContact(additionalGuestContact, loggingEvent, guests);
    }

    loggingEvent?.children?.push(`RSVP payload validated successfully ${LogEmoji.success}`);

    return {
      name: trimmedName,
      email: trimmedEmail,
      contactNumber: contactNumber ?? null,
      attending,
      dietaryRestrictions: dietaryRestrictions ?? null,
      mealPreference: mealPreference ?? null,
      message: message ?? null,
      additionalGuestContact: guests,
    };
  }

  // Email-only body — used by the existence check, which returns no personal data.
  validateEmailBody(req: Request, loggingEvent?: IRequestLogEvent): { email: string } {
    const { email } = req.body;
    V.requiredEmail(email, "email", loggingEvent);
    return { email: (email as string).trim() };
  }

  // Status check requires BOTH the guest's name and the 4-digit pin — a pin
  // alone no longer reveals whether/how someone RSVP'd.
  async validateRsvpStatusQuery(
    req: Request,
    loggingEvent?: IRequestLogEvent,
  ): Promise<{ name: string; pin: string }> {
    const { pin, name } = req.query;

    V.requiredString(name, "name", loggingEvent);

    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      loggingEvent?.children?.push(`'pin' must be exactly 4 digits ${LogEmoji.error}`);
      throw new InvalidRequestException("pin", "format");
    }

    loggingEvent?.children?.push(`'name' + 'pin' validated ${LogEmoji.success}`);
    return { name: (name as string).trim(), pin };
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
