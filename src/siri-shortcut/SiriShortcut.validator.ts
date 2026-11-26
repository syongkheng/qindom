import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { MAX_AMOUNT, MERCHANT_MAX_LENGTH } from "../applepay/ApplePay.validator.js";
import { ApplePaySmsInput } from "../applepay/ApplePay.types.js";
import { parseAmount, parseCardLast4, parseMerchant } from "./ApplePaySms.parser.js";

// Bank alerts are ~250 chars and a 10-part concatenated SMS is ~1,530. The cap (express.json allows
// 5 MB) keeps the merchant regexes' backtracking to well under a millisecond.
const SMS_BODY_MAX_LENGTH = 2000;

/** DECIMAL(10,2) range; NaN/Infinity are format errors too. Negative amounts are stored as sent. */
function checkAmount(amount: number, event?: IRequestLogEvent): number {
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) {
    event?.children?.push(`'amount' |x| ≤ ${MAX_AMOUNT} ${LogEmoji.error} `);
    throw new Exceptions.InvalidRequest("amount", "format");
  }
  return amount;
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
