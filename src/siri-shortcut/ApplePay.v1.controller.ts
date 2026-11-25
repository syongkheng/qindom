import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getApiKeyUserId, route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ApplePayService } from "../applepay/ApplePay.service.js";
import { ApplePayTransactionDto } from "../applepay/ApplePay.types.js";
import { validateTapTransactionBody } from "./SiriShortcut.validator.js";

/**
 * V1 Apple Pay ingestion (`/v1/ss`, `ss_` API key), fed by the "When Apple Pay is used" Shortcuts
 * automation (NFC taps only, fields arrive pre-structured). V2 (`ApplePay.v2.controller.ts`) parses
 * bank SMS instead; both write `tb_applepay_transaction` through `ApplePayService`.
 */
export default function createSsApplePayControllerV1(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new ApplePayService(db);

  router.post(
    "/ap/transaction",
    route("SsApplePayControllerV1.POST /ap/transaction", "Failed to record Apple Pay transaction", async (req, cr) => {
      const userId = getApiKeyUserId(req);
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const input = validateTapTransactionBody(req.body, event);
      return cr.ok<ApplePayTransactionDto>(await svc.recordTapTransaction(userId, input, req.logContext));
    }),
  );

  // No frontend calls this (fndom reads GET /applepay); kept because a user's Shortcut may.
  router.get(
    "/ap/transaction",
    route("SsApplePayControllerV1.GET /ap/transaction", "Failed to retrieve Apple Pay transactions", async (req, cr) =>
      cr.ok<ApplePayTransactionDto[]>(await svc.getTransactions(getApiKeyUserId(req), req.logContext)),
    ),
  );

  return router;
}
