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
}
