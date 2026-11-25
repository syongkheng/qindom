import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { DEFAULT_CURRENCY } from "../constants/Locale.js";
import { Time } from "../constants/Time.js";
import { ApplePayCardLabelBody, ApplePayCategoryBody, ApplePayManualTransactionBody } from "./ApplePay.types.js";

// tb_applepay_transaction.amount is DECIMAL(10,2).
const MAX_AMOUNT = 99_999_999.99;
// tb_applepay_transaction.merchant is VARCHAR(255).
const MERCHANT_MAX_LENGTH = 255;
// tb_applepay_transaction.category and tb_applepay_card_label.label are VARCHAR(64).
const CATEGORY_MAX_LENGTH = 64;
const CARD_LABEL_MAX_LENGTH = 64;
// Tolerate a little client clock skew, but reject clearly-future dates.
const FUTURE_SKEW_MS = 5 * Time.MINUTE_MS;
const CURRENCY_REGEX = /^[A-Z]{3}$/;
const CARD_LAST4_REGEX = /^\d{3,4}$/;

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

/** Optional free-text field: blank → null, otherwise a trimmed string of at most `maxLength`. */
function optionalText(value: unknown, field: string, maxLength: number, event?: IRequestLogEvent): string | null {
  if (isBlank(value)) return null;
  V.string(value, field, event, "(O)");
  const trimmed = (value as string).trim();
  if (trimmed.length > maxLength) throw new Exceptions.InvalidRequest(field, "format");
  return trimmed || null;
}

export function validateManualTransactionBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): ApplePayManualTransactionBody {
  const { amount, currency, merchant, occurredDt, category } = body;

  V.requiredNumber(amount, "amount", event);
  const amountValue = amount as number;
  if (amountValue <= 0 || amountValue > MAX_AMOUNT) throw new Exceptions.InvalidRequest("amount", "format");

  let normalizedCurrency: string = DEFAULT_CURRENCY;
  if (!isBlank(currency)) {
    V.string(currency, "currency", event, "(O)");
    normalizedCurrency = (currency as string).trim().toUpperCase();
    if (!CURRENCY_REGEX.test(normalizedCurrency)) throw new Exceptions.InvalidRequest("currency", "format");
  }

  V.requiredString(merchant, "merchant", event);
  const trimmedMerchant = (merchant as string).trim();
  if (!trimmedMerchant || trimmedMerchant.length > MERCHANT_MAX_LENGTH) {
    throw new Exceptions.InvalidRequest("merchant", "format");
  }

  V.requiredNumber(occurredDt, "occurredDt", event);
  const occurred = occurredDt as number;
  if (!Number.isInteger(occurred) || occurred <= 0 || occurred > Date.now() + FUTURE_SKEW_MS) {
    throw new Exceptions.InvalidRequest("occurredDt", "format");
  }

  return {
    amount: Math.round(amountValue * 100) / 100,
    currency: normalizedCurrency,
    merchant: trimmedMerchant,
    occurredDt: occurred,
    category: optionalText(category, "category", CATEGORY_MAX_LENGTH, event),
  };
}

export function validateCategoryBody(body: Record<string, unknown>, event?: IRequestLogEvent): ApplePayCategoryBody {
  return { category: optionalText(body.category, "category", CATEGORY_MAX_LENGTH, event) };
}

export function validateCardLabelBody(
  cardLast4Param: string,
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): ApplePayCardLabelBody {
  V.regex(cardLast4Param, CARD_LAST4_REGEX, "cardLast4", event);
  return { cardLast4: cardLast4Param, label: optionalText(body.label, "label", CARD_LABEL_MAX_LENGTH, event) };
}
