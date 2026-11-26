import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import {
  WeddingRsvpBody,
  WeddingRsvpGuestBody,
  WeddingRsvpPreflightBody,
  WeddingRsvpStatusQuery,
  WeddingVisitBody,
} from "./Wedding.types.js";

// Each guest email gets its own confirmation, so the cap also bounds how many
// emails one submission can send (submitter + guests).
export const MAX_ADDITIONAL_GUESTS = 10;

// tb_wedding_rsvp / tb_wedding_rsvp_guest column widths, so an oversized value is a 400, not a DB error.
const NAME_MAX_LENGTH = 255; // name VARCHAR(255)
const EMAIL_MAX_LENGTH = 255; // email VARCHAR(255)
const CONTACT_NUMBER_MAX_LENGTH = 30; // contact_number VARCHAR(30) (CONTACT_NUMBER_REGEX caps it at 20 anyway)
const DIETARY_MAX_LENGTH = 100; // dietary_restrictions VARCHAR(100)
const MEAL_MAX_LENGTH = 100; // meal_preference VARCHAR(100)
const MESSAGE_MAX_LENGTH = 1000; // message VARCHAR(1000)

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_NUMBER_REGEX = /^\+?[\d\s\-().]{7,20}$/;
const PIN_REGEX = /^\d{4}$/;

// POST /visit is a beacon: values are clipped to these lengths, never rejected.
const VISIT_LANGUAGE_MAX_LENGTH = 20;
const VISIT_TIMEZONE_MAX_LENGTH = 60;
const VISIT_SCREEN_MAX_LENGTH = 20;
const VISIT_REFERRER_MAX_LENGTH = 200;
const VISIT_PATH_MAX_LENGTH = 100;

const GUESTS_FIELD = "additionalGuestContact";

type Body = Record<string, unknown> | undefined;

function requiredEmail(value: unknown, field: string, event?: IRequestLogEvent): string {
  const email = V.requiredText(value, field, EMAIL_MAX_LENGTH, event);
  V.email(email, field, event);
  return email;
}

function optionalEmail(value: unknown, field: string, event?: IRequestLogEvent): string | null {
  const email = V.optionalText(value, field, EMAIL_MAX_LENGTH, event);
  if (email !== null) V.email(email, field, event, "(O)");
  return email;
}

function optionalContactNumber(value: unknown, field: string, event?: IRequestLogEvent): string | null {
  const contact = V.optionalText(value, field, CONTACT_NUMBER_MAX_LENGTH, event);
  if (contact !== null) V.regex(contact, CONTACT_NUMBER_REGEX, field, event, "(O)");
  return contact;
}

function validateGuest(contact: unknown, index: number, event?: IRequestLogEvent): WeddingRsvpGuestBody {
  const prefix = `${GUESTS_FIELD}[${index}]`;
  if (typeof contact !== "object" || contact === null || Array.isArray(contact)) {
    event?.children?.push(`${prefix} object ${LogEmoji.error}`);
    throw new Exceptions.InvalidRequest(prefix, "format");
  }
  const guest = contact as Record<string, unknown>;
  return {
    name: V.requiredText(guest.name, `${prefix}.name`, NAME_MAX_LENGTH, event),
    email: optionalEmail(guest.email, `${prefix}.email`, event),
    contactNumber: optionalContactNumber(guest.contactNumber, `${prefix}.contactNumber`, event),
    dietaryRestrictions: V.optionalText(
      guest.dietaryRestrictions,
      `${prefix}.dietaryRestrictions`,
      DIETARY_MAX_LENGTH,
      event,
    ),
    mealPreference: V.optionalText(guest.mealPreference, `${prefix}.mealPreference`, MEAL_MAX_LENGTH, event),
  };
}

function validateGuests(value: unknown, event?: IRequestLogEvent): WeddingRsvpGuestBody[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ADDITIONAL_GUESTS) {
    event?.children?.push(`${GUESTS_FIELD} array of ≤${MAX_ADDITIONAL_GUESTS} ${LogEmoji.error}`);
    throw new Exceptions.InvalidRequest(GUESTS_FIELD, "format");
  }
  return value.map((contact, index) => validateGuest(contact, index, event));
}

/** POST /rsvp: name + email + attending required; strings trimmed and capped at their column width. */
export function validateRsvpBody(body: Body, event?: IRequestLogEvent): WeddingRsvpBody {
  const b = body ?? {};
  const name = V.requiredText(b.name, "name", NAME_MAX_LENGTH, event);
  const email = requiredEmail(b.email, "email", event);
  V.requiredBoolean(b.attending, "attending", event);
  return {
    name,
    email,
    contactNumber: optionalContactNumber(b.contactNumber, "contactNumber", event),
    attending: b.attending as boolean,
    dietaryRestrictions: V.optionalText(b.dietaryRestrictions, "dietaryRestrictions", DIETARY_MAX_LENGTH, event),
    mealPreference: V.optionalText(b.mealPreference, "mealPreference", MEAL_MAX_LENGTH, event),
    message: V.optionalText(b.message, "message", MESSAGE_MAX_LENGTH, event),
    additionalGuestContact: validateGuests(b.additionalGuestContact, event),
  };
}

/** POST /rsvp/preflight: `{ email }` only. */
export function validatePreflightBody(body: Body, event?: IRequestLogEvent): WeddingRsvpPreflightBody {
  return { email: requiredEmail(body?.email, "email", event) };
}

/** GET /rsvp/status: BOTH the name and the 4-digit pin are required, so a pin alone reveals nothing. */
export function validateStatusQuery(query: Body, event?: IRequestLogEvent): WeddingRsvpStatusQuery {
  const name = V.requiredText(query?.name, "name", NAME_MAX_LENGTH, event);
  V.regex(query?.pin, PIN_REGEX, "pin", event);
  return { name, pin: query?.pin as string };
}

const clip = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** POST /visit: every field optional and clipped; anything that isn't a string becomes "". */
export function sanitiseVisitBody(body: Body): WeddingVisitBody {
  return {
    language: clip(body?.language, VISIT_LANGUAGE_MAX_LENGTH),
    timezone: clip(body?.timezone, VISIT_TIMEZONE_MAX_LENGTH),
    screen: clip(body?.screen, VISIT_SCREEN_MAX_LENGTH),
    referrer: clip(body?.referrer, VISIT_REFERRER_MAX_LENGTH),
    path: clip(body?.path, VISIT_PATH_MAX_LENGTH),
  };
}
