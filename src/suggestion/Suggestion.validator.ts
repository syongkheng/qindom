import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";

export class SuggestionValidator {
  static validateActivitySearch(
    query: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { destination: string } {
    const { destination } = query;
    V.requiredString(destination, "destination", loggingEvent);
    if (!(destination as string).trim()) {
      loggingEvent?.children?.push(`'destination' nonEmpty ${LogEmoji.error}`);
      throw new InvalidRequestException("destination", "format");
    }
    loggingEvent?.children?.push(`'destination' nonEmpty ${LogEmoji.success}`);
    return { destination: (destination as string).trim() };
  }

  private static validateImages(images: unknown, loggingEvent?: IRequestLogEvent): string[] | undefined {
    if (images === undefined || images === null) return undefined;
    if (!Array.isArray(images) || !images.every((i) => typeof i === "string")) {
      loggingEvent?.children?.push(`'images' must be a string[] ${LogEmoji.error}`);
      throw new InvalidRequestException("images", "format");
    }
    return images.map((i) => i.trim()).filter(Boolean);
  }

  static validateCreateActivity(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { destinationTag: string; title: string; category?: string; estimatedHours?: number; description?: string; images?: string[] } {
    const { destinationTag, title, category, estimatedHours, description, images } = body;
    V.requiredString(destinationTag, "destinationTag", loggingEvent);
    V.requiredString(title, "title", loggingEvent);
    V.optionalString(category, "category", loggingEvent);
    V.optionalString(description, "description", loggingEvent);
    if (estimatedHours !== undefined && estimatedHours !== null) {
      V.number(estimatedHours, "estimatedHours", loggingEvent, "(O)");
    }
    return {
      destinationTag: (destinationTag as string).trim(),
      title: (title as string).trim(),
      category: category as string | undefined,
      estimatedHours: estimatedHours as number | undefined,
      description: description as string | undefined,
      images: this.validateImages(images, loggingEvent),
    };
  }

  static validateUpdateActivity(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { destinationTag?: string; title?: string; category?: string; estimatedHours?: number; description?: string; images?: string[] } {
    const { destinationTag, title, category, estimatedHours, description, images } = body;
    V.optionalString(destinationTag, "destinationTag", loggingEvent);
    V.optionalString(title, "title", loggingEvent);
    V.optionalString(category, "category", loggingEvent);
    V.optionalString(description, "description", loggingEvent);
    if (estimatedHours !== undefined && estimatedHours !== null) {
      V.number(estimatedHours, "estimatedHours", loggingEvent, "(O)");
    }
    return {
      destinationTag: (destinationTag as string | undefined)?.trim(),
      title: (title as string | undefined)?.trim(),
      category: category as string | undefined,
      estimatedHours: estimatedHours as number | undefined,
      description: description as string | undefined,
      images: this.validateImages(images, loggingEvent),
    };
  }

  static validateCreatePlace(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { destinationTag: string; title: string; category?: string; description?: string; images?: string[]; lat: number; lng: number } {
    const { destinationTag, title, category, description, images, lat, lng } = body;
    V.requiredString(destinationTag, "destinationTag", loggingEvent);
    V.requiredString(title, "title", loggingEvent);
    V.optionalString(category, "category", loggingEvent);
    V.optionalString(description, "description", loggingEvent);
    V.requiredNumber(lat, "lat", loggingEvent);
    V.requiredNumber(lng, "lng", loggingEvent);
    return {
      destinationTag: (destinationTag as string).trim(),
      title: (title as string).trim(),
      category: category as string | undefined,
      description: description as string | undefined,
      images: this.validateImages(images, loggingEvent),
      lat: lat as number,
      lng: lng as number,
    };
  }

  static validateUpdatePlace(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { destinationTag?: string; title?: string; category?: string; description?: string; images?: string[]; lat?: number; lng?: number } {
    const { destinationTag, title, category, description, images, lat, lng } = body;
    V.optionalString(destinationTag, "destinationTag", loggingEvent);
    V.optionalString(title, "title", loggingEvent);
    V.optionalString(category, "category", loggingEvent);
    V.optionalString(description, "description", loggingEvent);
    if (lat !== undefined && lat !== null) V.number(lat, "lat", loggingEvent, "(O)");
    if (lng !== undefined && lng !== null) V.number(lng, "lng", loggingEvent, "(O)");
    return {
      destinationTag: (destinationTag as string | undefined)?.trim(),
      title: (title as string | undefined)?.trim(),
      category: category as string | undefined,
      description: description as string | undefined,
      images: this.validateImages(images, loggingEvent),
      lat: lat as number | undefined,
      lng: lng as number | undefined,
    };
  }

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
