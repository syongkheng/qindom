import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { NoteSuggestionBody, PackingSuggestionBody } from "./Suggestion.types.js";

// Column widths: tb_suggestion_packing / tb_suggestion_note.
const TRIP_TYPE_MAX_LENGTH = 64;
const LABEL_MAX_LENGTH = 255;
const LABEL_KEY_MAX_LENGTH = 128;
const CATEGORY_MAX_LENGTH = 64;
const COUNTRY_MAX_LENGTH = 128;
const TITLE_MAX_LENGTH = 255;
const URL_MAX_LENGTH = 512;
// tb_suggestion_note.notes is TEXT (64 KB); keep it to something a person would write.
const NOTES_MAX_LENGTH = 5000;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

/** Optional non-negative whole number (days / hours). */
function optionalCount(value: unknown, field: string, event?: IRequestLogEvent): number | null {
  if (value === undefined || value === null) return null;
  V.number(value, field, event, "(O)");
  if (!Number.isInteger(value) || (value as number) < 0) throw new Exceptions.InvalidRequest(field, "format");
  return value as number;
}

export function validatePackingBody(body: Record<string, unknown>, event?: IRequestLogEvent): PackingSuggestionBody {
  return {
    tripType: V.requiredText(body.tripType, "tripType", TRIP_TYPE_MAX_LENGTH, event),
    label: V.requiredText(body.label, "label", LABEL_MAX_LENGTH, event),
    labelKey: V.optionalText(body.labelKey, "labelKey", LABEL_KEY_MAX_LENGTH, event),
    category: V.optionalText(body.category, "category", CATEGORY_MAX_LENGTH, event),
  };
}

export function validateNoteBody(body: Record<string, unknown>, event?: IRequestLogEvent): NoteSuggestionBody {
  const url = V.requiredText(body.url, "url", URL_MAX_LENGTH, event);
  if (!HTTP_URL_REGEX.test(url)) throw new Exceptions.InvalidRequest("url", "format");

  if (body.mandatory !== undefined && body.mandatory !== null) V.boolean(body.mandatory, "mandatory", event, "(O)");

  return {
    country: V.requiredText(body.country, "country", COUNTRY_MAX_LENGTH, event),
    title: V.requiredText(body.title, "title", TITLE_MAX_LENGTH, event),
    url,
    category: V.optionalText(body.category, "category", CATEGORY_MAX_LENGTH, event),
    mandatory: body.mandatory === true,
    minDaysBeforeArrival: optionalCount(body.minDaysBeforeArrival, "minDaysBeforeArrival", event),
    maxAdvanceHours: optionalCount(body.maxAdvanceHours, "maxAdvanceHours", event),
    notes: V.optionalText(body.notes, "notes", NOTES_MAX_LENGTH, event),
  };
}

export function validateCountryQuery(query: Record<string, unknown>, event?: IRequestLogEvent): { country: string } {
  return { country: V.requiredText(query.country, "country", COUNTRY_MAX_LENGTH, event) };
}

export function validateIdParam(params: Record<string, string>): { id: number } {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new Exceptions.InvalidRequest("id", "format");
  return { id };
}
