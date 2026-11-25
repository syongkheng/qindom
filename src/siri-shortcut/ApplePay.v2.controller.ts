import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { SsApplePayV1Service } from "./ApplePay.v1.service.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

// "SGD 1.99", "USD 12.50", "SGD11.25" (Citi, no space) — the currency code
// and amount in a bank transaction-alert SMS. Group 1 = currency, group 2 =
// amount. The amount is stored as-is in that currency (never converted).
const AMOUNT_REGEX = /\b([A-Z]{3})\s*([\d,]+\.\d{2})\b/;
// "...UOB Card ending 1986...", "...DBS/POSB card ending 5244..." — the
// last 3-4 digits the bank includes in these alerts; the full PAN is never
// sent in the SMS or stored here.
const CARD_LAST4_REGEX = /card\s+ending\s+(\d{3,4})/i;
// Merchant sits after "at " (UOB: "...at Douyin Live. If unauthorised...")
// or "to " (DBS: "...to 7-ELEVEN -TAMPINES MAR on 27 SEP 12:44 (SGT) was
// completed. If unauthorised..."), lazily captured up to whichever
// boundary comes first: a trailing "on <day> <MON>" date, "was completed",
// the "If unauthorised" boilerplate, or end-of-string. Lookahead so none of
// those boundary words end up inside the captured merchant.
const MERCHANT_REGEX_GENERIC =
  /\b(?:at|to)\s+(.+?)(?=\s+on\s+\d{1,2}\s+[A-Z]{3}\b|\s+was\s+completed\b|\.\s*(?:if unauthorised|$)|$)/i;

// Citibank SG: "There was a charge of SGD11.25 on your Card ending 3284 by
// TikTok Shop Seller    Singapore    SGP on 14/10/26 18:13. If
// unauthorized, call our hotline." — merchant sits after "by", up to the
// numeric "on dd/mm/yy" date. Tried before the generic pattern since the
// UOB/DBS formats never use "by ... on <numeric date>".
const MERCHANT_REGEX_CITI = /\bby\s+([\s\S]+?)\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;

// Citi pads the merchant descriptor with runs of spaces before the city and
// country code ("Spotify P480A42C6A    Stockholm    SWE"); keep only the
// part before the first run. If the spacing was collapsed somewhere along
// the way, the whole descriptor is kept rather than guessing.
function cleanCitiMerchant(raw: string): string {
  return raw.split(/\s{2,}/)[0].trim();
}

export function parseMerchant(text: string): string | null {
  const citi = MERCHANT_REGEX_CITI.exec(text);
  if (citi) return cleanCitiMerchant(citi[1]) || null;
  const generic = MERCHANT_REGEX_GENERIC.exec(text);
  return generic ? generic[1].trim() || null : null;
}

// V2 of the Siri Shortcut Apple Pay/card transaction ingestion. V1
// (ApplePay.v1.controller.ts) is fed by the "When Apple Pay is used"
// automation, which only fires on NFC taps and arrives pre-structured
// (amount/merchant/name as separate fields). V2 is fed by a Shortcut
// automation that forwards the raw text of any bank transaction-alert SMS
// as-is, so it also picks up online transactions — this endpoint does the
// parsing V1 never had to. V1 is left fully intact (not removed) so it
// keeps working for anyone still using that automation; both write into
// the same tb_applepay_transaction table (tagged via `source`), so the
// dashboard already shows a single combined feed.
export default function createSsApplePayControllerV2(db: KnexSqlUtilities) {
  const router = Router();
  const service = new SsApplePayV1Service(db);

  router.post("/ap/sms", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      const requestBodyStructuralValidationLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;

      const { smsBody } = req.body;
      StructuralValidationUtilities.requiredString(smsBody, "smsBody", requestBodyStructuralValidationLoggingEvent);

      const text = String(smsBody);

      const amountMatch = AMOUNT_REGEX.exec(text);
      if (!amountMatch) throw new Exceptions.InvalidRequest("amount", "mandatory");
      const currency = amountMatch[1];
      const parsedAmount = Number(amountMatch[2].replace(/,/g, ""));
      if (Number.isNaN(parsedAmount)) throw new Exceptions.InvalidRequest("amount", "format");

      const merchant = parseMerchant(text);
      if (!merchant) throw new Exceptions.InvalidRequest("merchant", "mandatory");

      // Card number is best-effort — some alert templates may not include
      // it, and it's not essential to logging the transaction.
      const cardMatch = CARD_LAST4_REGEX.exec(text);
      const cardLast4 = cardMatch ? cardMatch[1] : null;

      const userId = logContext?.metadata?.userId as number;
      const serviceResponse = await service.recordSmsTransaction(
        userId,
        parsedAmount,
        currency,
        merchant,
        cardLast4,
        logContext,
      );

      // Shortcut-friendly shape — just the fields extracted from the SMS,
      // for the automation to show back as a confirmation (e.g. via "Show
      // Result"). The full row (id/category/source/etc.) is still available
      // to the authenticated dashboard via GET /applepay.
      return cr.ok({
        amount: serviceResponse.amount,
        currency: serviceResponse.currency,
        merchant: serviceResponse.merchant,
        cardLast4: serviceResponse.cardLast4,
        timestamp: serviceResponse.occurredDt,
      });
    } catch (err) {
      // Every failure below — validation (missing/malformed amount or
      // merchant) or unexpected — still comes back through the standard
      // { code, status, data } envelope via handleException, never a bare
      // status code with no body, so the Shortcut always has something to
      // show the user on failure too.
      return handleException(err, cr, "SsApplePayControllerV2.POST /ap/sms", "Failed to record transaction from SMS");
    }
  });

  return router;
}
