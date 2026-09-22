import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";

export class SuggestionValidator {
  static validateCreatePacking(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { tripType: string; label: string; labelKey?: string; category?: string } {
    const { tripType, label, labelKey, category } = body;
    V.requiredString(tripType, "tripType", loggingEvent);
    V.requiredString(label, "label", loggingEvent);
    V.optionalString(labelKey, "labelKey", loggingEvent);
    V.optionalString(category, "category", loggingEvent);
    return {
      tripType: (tripType as string).trim(),
      label: (label as string).trim(),
      labelKey: labelKey as string | undefined,
      category: category as string | undefined,
    };
  }

  static validateNoteSearch(
    query: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { country: string } {
    const { country } = query;
    V.requiredString(country, "country", loggingEvent);
    if (!(country as string).trim()) {
      loggingEvent?.children?.push(`'country' nonEmpty ${LogEmoji.error}`);
      throw new InvalidRequestException("country", "format");
    }
    loggingEvent?.children?.push(`'country' nonEmpty ${LogEmoji.success}`);
    return { country: (country as string).trim() };
  }

  static validateCreateNote(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): {
    country: string;
    title: string;
    url: string;
    category?: string;
    mandatory?: boolean;
    minDaysBeforeArrival?: number;
    maxAdvanceHours?: number;
    notes?: string;
  } {
    const { country, title, url, category, mandatory, minDaysBeforeArrival, maxAdvanceHours, notes } = body;
    V.requiredString(country, "country", loggingEvent);
    V.requiredString(title, "title", loggingEvent);
    V.requiredString(url, "url", loggingEvent);
    V.optionalString(category, "category", loggingEvent);
    V.optionalString(notes, "notes", loggingEvent);
    if (mandatory !== undefined && mandatory !== null) {
      V.boolean(mandatory, "mandatory", loggingEvent, "(O)");
    }
    if (minDaysBeforeArrival !== undefined && minDaysBeforeArrival !== null) {
      V.number(minDaysBeforeArrival, "minDaysBeforeArrival", loggingEvent, "(O)");
    }
    if (maxAdvanceHours !== undefined && maxAdvanceHours !== null) {
      V.number(maxAdvanceHours, "maxAdvanceHours", loggingEvent, "(O)");
    }
    return {
      country: (country as string).trim(),
      title: (title as string).trim(),
      url: (url as string).trim(),
      category: category as string | undefined,
      mandatory: mandatory as boolean | undefined,
      minDaysBeforeArrival: minDaysBeforeArrival as number | undefined,
      maxAdvanceHours: maxAdvanceHours as number | undefined,
      notes: notes as string | undefined,
    };
  }

  static validateIdParam(
    params: Record<string, string>,
    loggingEvent?: IRequestLogEvent,
  ): { id: number } {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      loggingEvent?.children?.push(`'id' invalid ${LogEmoji.error}`);
      throw new InvalidRequestException("id", "format");
    }
    loggingEvent?.children?.push(`'id' valid ${LogEmoji.success}`);
    return { id };
  }
}
