import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { CreateManualTransactionBody } from "../models/requests/ApplePayBody.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

// DECIMAL(10,2) ceiling for tb_applepay_transaction.amount
const MAX_AMOUNT = 99_999_999.99;
// Tolerate a little client clock skew, but reject clearly-future dates.
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export class ApplePayDashboardValidator {
  static validateCreateManualTransactionRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): CreateManualTransactionBody {
    const { amount, merchant, occurredDt, category } = body as any;

    V.requiredNumber(amount, "amount", loggingEvent);
    if (amount <= 0 || amount > MAX_AMOUNT) throw new Exceptions.InvalidRequest("amount", "format");

    V.requiredString(merchant, "merchant", loggingEvent);
    const trimmedMerchant = merchant.trim();
    if (!trimmedMerchant || trimmedMerchant.length > 255) throw new Exceptions.InvalidRequest("merchant", "format");

    V.requiredNumber(occurredDt, "occurredDt", loggingEvent);
    if (!Number.isInteger(occurredDt) || occurredDt <= 0 || occurredDt > Date.now() + FUTURE_SKEW_MS) {
      throw new Exceptions.InvalidRequest("occurredDt", "format");
    }

    let trimmedCategory: string | null = null;
    if (category !== undefined && category !== null && category !== "") {
      V.string(category, "category", loggingEvent, "(O)");
      trimmedCategory = category.trim().slice(0, 64) || null;
    }

    return {
      amount: Math.round(amount * 100) / 100,
      merchant: trimmedMerchant,
      occurredDt,
      category: trimmedCategory,
    };
  }

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
