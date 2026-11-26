/**
 * Pure parsers for the bank transaction-alert SMS that the V2 Shortcut forwards verbatim to
 * `POST /v2/ss/ap/sms`. No I/O and no exceptions: each returns null when its part is missing,
 * and `SiriShortcut.validator.ts` decides what that means for the request.
 *
 * Formats covered (see the tests for full samples):
 * - UOB:      "A transaction of SGD 1.99 was made with your UOB Card ending 1986 on 13/10/26 at Douyin Live. If unauthorised, …"
 * - DBS/POSB: "Transaction Alert: Your DBS/POSB card ending 5244 transaction of SGD 4.20 to 7-ELEVEN -TAMPINES MAR on 27 SEP 12:44 (SGT) was completed. …"
 * - Citibank: "There was a charge of SGD11.25 on your Card ending 3284 by TikTok Shop Seller    Singapore    SGP on 14/10/26 18:13. …"
 *
 * The validator caps the SMS length before these run, which keeps regex backtracking bounded.
 */
import { ParsedSmsAmount } from "./SiriShortcut.types.js";

/**
 * Currency code + amount, all banks: "SGD 1.99" (UOB, DBS), "SGD11.25" (Citi, no space),
 * "CNY 1,288.00". Group 1 = ISO 4217 code, group 2 = amount with optional thousands commas.
 * The amount is kept in that currency, never converted.
 */
const AMOUNT_REGEX = /\b([A-Z]{3})\s*([\d,]+\.\d{2})\b/;
const THOUSANDS_SEPARATOR_REGEX = /,/g;

/**
 * Card digits, all banks: "UOB Card ending 1986", "DBS/POSB card ending 5244", "Card ending 3284".
 * Banks only ever send the last 3–4 digits; the full card number is never in the SMS.
 */
const CARD_LAST4_REGEX = /card\s+ending\s+(\d{3,4})/i;

/**
 * Citibank: merchant after "by", up to the numeric "on dd/mm/yy" (or dd/mm/yyyy) date. Tried first,
 * because UOB/DBS never use "by … on <numeric date>". The capture starts and ends on a non-space so
 * it can't compete with the surrounding `\s+` for the same spaces: the old `([\s\S]+?)` took ~4 s
 * on "by" + 2,000 spaces and blocked the event loop.
 */
const MERCHANT_REGEX_CITI = /\bby\s+(\S(?:[\s\S]*?\S)?)\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;

/**
 * UOB ("…at Douyin Live. If unauthorised…") and DBS ("…to 7-ELEVEN -TAMPINES MAR on 27 SEP 12:44
 * (SGT) was completed…"): merchant after "at" or "to", lazily up to the first boundary: a DBS
 * "on <day> <MON>" date, "was completed", a "." before the "If unauthorised" boilerplate or the end,
 * or the end of the text. The boundaries are lookaheads so they never end up in the merchant.
 */
const MERCHANT_REGEX_GENERIC =
  /\b(?:at|to)\s+(.+?)(?=\s+on\s+\d{1,2}\s+[A-Z]{3}\b|\s+was\s+completed\b|\.\s*(?:if unauthorised|$)|$)/i;

/**
 * Citi pads the descriptor with runs of spaces before the city and country code
 * ("Spotify P480A42C6A    Stockholm    SWE"). Everything after the first run is dropped; if the
 * spacing was collapsed on the way, the whole descriptor is kept rather than guessing.
 */
const CITI_PADDING_REGEX = /\s{2,}/;

export function parseAmount(text: string): ParsedSmsAmount | null {
  const match = AMOUNT_REGEX.exec(text);
  if (!match) return null;
  return { currency: match[1], amount: Number(match[2].replace(THOUSANDS_SEPARATOR_REGEX, "")) };
}

export function parseMerchant(text: string): string | null {
  const citi = MERCHANT_REGEX_CITI.exec(text);
  if (citi) return citi[1].split(CITI_PADDING_REGEX)[0].trim() || null;
  const generic = MERCHANT_REGEX_GENERIC.exec(text);
  return generic ? generic[1].trim() || null : null;
}

/** Best effort: some alert templates may leave the card out, and the transaction is still recorded. */
export function parseCardLast4(text: string): string | null {
  return CARD_LAST4_REGEX.exec(text)?.[1] ?? null;
}
