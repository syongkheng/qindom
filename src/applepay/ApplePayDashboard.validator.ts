import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";

export class ApplePayDashboardValidator {
  static validateUpdateCategoryRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { category: string | null } {
    const { category } = body as any;
    // Explicitly allow null/empty to clear a category — only type-check when a value is present.
    if (category !== undefined && category !== null && category !== "") {
      V.string(category, "category", loggingEvent, "(O)");
    }
    return { category: category || null };
  }

  static validateSetCardLabelRequest(
    cardLast4Param: string,
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { cardLast4: string; label: string | null } {
    V.regex(cardLast4Param, /^\d{3,4}$/, "cardLast4", loggingEvent);

    const { label } = body as any;
    // Explicitly allow null/empty to clear a label — only type-check when a value is present.
    if (label !== undefined && label !== null && label !== "") {
      V.string(label, "label", loggingEvent, "(O)");
    }
    return { cardLast4: cardLast4Param, label: label || null };
  }
}
