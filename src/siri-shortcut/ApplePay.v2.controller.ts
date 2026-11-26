import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getApiKeyUserId, route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ApplePayService } from "../applepay/ApplePay.service.js";
import { ApplePayTransactionDto } from "../applepay/ApplePay.types.js";
import { SiriShortcutSmsConfirmationDto } from "./SiriShortcut.types.js";
import { validateSmsBody } from "./SiriShortcut.validator.js";

/** Only the fields read from the SMS, for the Shortcut to show back. */
function toSmsConfirmationDto(transaction: ApplePayTransactionDto): SiriShortcutSmsConfirmationDto {
  return {
    amount: transaction.amount,
    currency: transaction.currency,
    merchant: transaction.merchant,
    cardLast4: transaction.cardLast4,
    timestamp: transaction.occurredDt,
  };
}

/**
 * V2 card-transaction ingestion (`/v2/ss`, `ss_` API key). A Shortcut automation forwards the raw
 * text of any bank transaction-alert SMS, so online purchases are captured too (V1 only sees NFC
 * taps). Parsing lives in `ApplePaySms.parser.ts`. Failures still answer with the standard
 * envelope, so the Shortcut always has a message to show.
 */
export default function createSsApplePayControllerV2(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new ApplePayService(db);

  router.post(
    "/ap/sms",
    route("SsApplePayControllerV2.POST /ap/sms", "Failed to record transaction from SMS", async (req, cr) => {
      const userId = getApiKeyUserId(req);
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const input = validateSmsBody(req.body, event);
      const transaction = await svc.recordSmsTransaction(userId, input, req.logContext);
      return cr.ok<SiriShortcutSmsConfirmationDto>(toSmsConfirmationDto(transaction));
    }),
  );

  return router;
}
