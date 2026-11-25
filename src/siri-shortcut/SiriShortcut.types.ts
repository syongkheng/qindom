/** Currency + amount read from a bank SMS (`ApplePaySms.parser.ts`). */
export interface ParsedSmsAmount {
  /** ISO 4217 code as written in the SMS ("SGD", "CNY"). */
  currency: string;
  amount: number;
}

/**
 * `POST /v2/ss/ap/sms` response: just what was read from the SMS, for the Shortcut to show back
 * ("Show Result"). Frozen contract with the user's Shortcut; the full row is on `GET /applepay`.
 */
export interface SiriShortcutSmsConfirmationDto {
  amount: number;
  currency: string;
  merchant: string;
  cardLast4: string | null;
  /** Server receipt time (ms), stored as `occurred_dt`. */
  timestamp: number;
}
