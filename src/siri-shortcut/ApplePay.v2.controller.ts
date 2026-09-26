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

// "SGD 1.99", "USD 12.50" — the currency amount in a bank transaction-alert
// email.
const AMOUNT_REGEX = /\b[A-Z]{3}\s*([\d,]+\.\d{2})\b/;
// "...UOB Card ending 1986..." — the last 3-4 digits the bank includes in
// these alerts; the full PAN is never sent in the email or stored here.
const CARD_LAST4_REGEX = /card\s+ending\s+(\d{3,4})/i;
// "...at Douyin Live. If unauthorised..." — merchant sits between " at "
// and the sentence boundary before the fraud-hotline boilerplate, falling
// back to end-of-string if that boilerplate isn't present.
const MERCHANT_REGEX = /\bat\s+(.+?)\.\s*(?:if unauthorised|$)/i;

// V2 of the Siri Shortcut Apple Pay/card transaction ingestion. V1
// (ApplePay.v1.controller.ts) is fed by the "When Apple Pay is used"
// automation, which only fires on NFC taps and arrives pre-structured
// (amount/merchant/name as separate fields). V2 is fed by a Mail-rule
// Shortcut automation that forwards the raw text of any bank
// transaction-alert email as-is, so it also picks up online transactions —
// this endpoint does the parsing V1 never had to. V1 is left fully intact
// (not removed) so it keeps working for anyone still using that automation;
// both write into the same tb_applepay_transaction table (tagged via
// `source`), so the dashboard already shows a single combined feed.
export default function createSsApplePayControllerV2(db: KnexSqlUtilities) {
  const router = Router();
  const service = new SsApplePayV1Service(db);

  router.post("/ap/email", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      const requestBodyStructuralValidationLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;

      const { emailBody } = req.body;
      StructuralValidationUtilities.requiredString(emailBody, "emailBody", requestBodyStructuralValidationLoggingEvent);

      const text = String(emailBody);

      const amountMatch = AMOUNT_REGEX.exec(text);
      if (!amountMatch) throw new Exceptions.InvalidRequest("amount", "mandatory");
      const parsedAmount = Number(amountMatch[1].replace(/,/g, ""));
      if (Number.isNaN(parsedAmount)) throw new Exceptions.InvalidRequest("amount", "format");

      const merchantMatch = MERCHANT_REGEX.exec(text);
      if (!merchantMatch) throw new Exceptions.InvalidRequest("merchant", "mandatory");
      const merchant = merchantMatch[1].trim();

      // Card number is best-effort — some alert templates may not include
      // it, and it's not essential to logging the transaction.
      const cardMatch = CARD_LAST4_REGEX.exec(text);
      const cardLast4 = cardMatch ? cardMatch[1] : null;

      const userId = logContext?.metadata?.userId as number;
      const serviceResponse = await service.recordEmailTransaction(userId, parsedAmount, merchant, cardLast4, logContext);

      // Shortcut-friendly shape — just the fields extracted from the email,
      // for the automation to show back as a confirmation (e.g. via "Show
      // Result"). The full row (id/category/source/etc.) is still available
      // to the authenticated dashboard via GET /applepay.
      return cr.ok({
        amount: serviceResponse.amount,
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
      return handleException(err, cr, "SsApplePayControllerV2.POST /ap/email", "Failed to record transaction from email");
    }
  });

  return router;
}
