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

  static validateCreateActivity(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { destinationTag: string; title: string; category?: string; estimatedHours?: number; description?: string } {
    const { destinationTag, title, category, estimatedHours, description } = body;
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
