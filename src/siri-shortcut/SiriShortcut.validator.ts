import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { MAX_AMOUNT, MERCHANT_MAX_LENGTH } from "../applepay/ApplePay.validator.js";
import { ApplePaySmsInput, ApplePayTapInput } from "../applepay/ApplePay.types.js";
import { parseAmount, parseCardLast4, parseMerchant } from "./ApplePaySms.parser.js";

// tb_applepay_transaction.name is VARCHAR(255).
const NAME_MAX_LENGTH = 255;
// Bank alerts are ~250 chars and a 10-part concatenated SMS is ~1,530. The cap (express.json allows
// 5 MB) keeps the merchant regexes' backtracking to well under a millisecond.
const SMS_BODY_MAX_LENGTH = 2000;
// The V1 Shortcut sometimes formats the amount with the currency symbol ("$12.50").
const LEADING_DOLLAR_REGEX = /^\$/;

/** DECIMAL(10,2) range; NaN/Infinity are format errors too. Negative amounts are stored as sent. */
function checkAmount(amount: number, event?: IRequestLogEvent): number {
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) {
    event?.children?.push(`'amount' |x| ≤ ${MAX_AMOUNT} ${LogEmoji.error} `);
    throw new Exceptions.InvalidRequest("amount", "format");
  }
  return amount;
}

/**
 * V1 Shortcut text field: present and a string, at most `maxLength` after trimming. Blank is kept
 * as "" (what the route always stored), so an odd Apple Pay payload never loses the transaction.
 */
function shortcutText(value: unknown, field: string, maxLength: number, event?: IRequestLogEvent): string {
  V.requiredString(value, field, event);
  return V.optionalText(value, field, maxLength, event) ?? "";
}

/**
 * `POST /v1/ss/ap/transaction` `{ amount, merchant, name }`. Shortcuts dictionary values are text, so
 * every field must be a string and `amount` is parsed here ("12.50" or "$12.50"; the `$` is never stored).
 */
export function validateTapTransactionBody(body: Record<string, unknown>, event?: IRequestLogEvent): ApplePayTapInput {
  V.requiredString(body.amount, "amount", event);
  const amount = Number((body.amount as string).trim().replace(LEADING_DOLLAR_REGEX, ""));
  return {
    amount: checkAmount(amount, event),
    merchant: shortcutText(body.merchant, "merchant", MERCHANT_MAX_LENGTH, event),
    name: shortcutText(body.name, "name", NAME_MAX_LENGTH, event),
  };
}

/**
 * `POST /v2/ss/ap/sms` `{ smsBody }`: the raw bank alert, parsed into the transaction to store.
 * Currency + amount and merchant are required; the card digits are best effort.
 */
export function validateSmsBody(body: Record<string, unknown>, event?: IRequestLogEvent): ApplePaySmsInput {
  const text = V.requiredText(body.smsBody, "smsBody", SMS_BODY_MAX_LENGTH, event);

  const parsed = parseAmount(text);
  if (!parsed) throw new Exceptions.InvalidRequest("amount", "mandatory");

  return {
    amount: checkAmount(parsed.amount, event),
    currency: parsed.currency,
    merchant: V.requiredText(parseMerchant(text), "merchant", MERCHANT_MAX_LENGTH, event),
    cardLast4: parseCardLast4(text),
  };
}
