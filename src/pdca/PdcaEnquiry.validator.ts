import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { PdcaEnquiryBody } from "./PdcaEnquiry.types.js";

const NAME_MAX_LENGTH = 120;
const CLINIC_MAX_LENGTH = 160;
const PHONE_MAX_LENGTH = 20;
// RFC 5321 address limit.
const EMAIL_MAX_LENGTH = 254;
const MESSAGE_MAX_LENGTH = 4000;
const HONEYPOT_MAX_LENGTH = 200;
const PHONE_REGEX = /^[+()\-\s\d]{8,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contact form: name + message required, consent must be `true`, and at least one of phone / email.
 * Optional fields come back as "" (not null) so the mail templates can test them directly.
 */
export function validateEnquiryBody(body: Record<string, unknown>, event?: IRequestLogEvent): PdcaEnquiryBody {
  const name = V.requiredText(body.name, "name", NAME_MAX_LENGTH, event);
  const clinic = V.optionalText(body.clinic, "clinic", CLINIC_MAX_LENGTH, event) ?? "";
  const phone = V.optionalText(body.phone, "phone", PHONE_MAX_LENGTH, event) ?? "";
  const email = V.optionalText(body.email, "email", EMAIL_MAX_LENGTH, event) ?? "";
  const message = V.requiredText(body.message, "message", MESSAGE_MAX_LENGTH, event);

  if (body.consent !== true) throw new Exceptions.InvalidRequest("consent", "format");
  if (!phone && !email) throw new Exceptions.InvalidRequest("contact", "mandatory");
  if (phone && !PHONE_REGEX.test(phone)) throw new Exceptions.InvalidRequest("phone", "format");
  if (email && !EMAIL_REGEX.test(email)) throw new Exceptions.InvalidRequest("email", "format");

  // Not trimmed: isSpam() trims when checking.
  let website = "";
  if (body.website !== undefined && body.website !== null) {
    V.string(body.website, "website", event, "(O)");
    website = body.website as string;
    if (website.length > HONEYPOT_MAX_LENGTH) throw new Exceptions.InvalidRequest("website", "format");
  }

  return { name, clinic, phone, email, message, consent: true, website };
}
