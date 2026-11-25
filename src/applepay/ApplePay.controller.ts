import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ApplePayService } from "./ApplePay.service.js";
import { validateCardLabelBody, validateCategoryBody, validateManualTransactionBody } from "./ApplePay.validator.js";
import {
  ApplePayCardLabelDto,
  ApplePayDeletedDto,
  ApplePayRestoredDto,
  ApplePayTransactionDto,
} from "./ApplePay.types.js";

/**
 * Authenticated web dashboard (mounted under `mw.auth`) for the transactions the Siri
 * Shortcut automations log (siri-shortcut/ApplePay.v1|v2.controller.ts, API key) plus manual entries.
 */
export default function createApplePayController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new ApplePayService(db);

  router.get(
    "/",
    route("ApplePayController.GET /", "Failed to load transactions", async (req, cr) =>
      cr.ok<ApplePayTransactionDto[]>(await svc.getTransactions(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/",
    route("ApplePayController.POST /", "Failed to add transaction", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateManualTransactionBody(req.body, event);
      return cr.ok<ApplePayTransactionDto>(await svc.recordManualTransaction(getUser(req).id, body, req.logContext));
    }),
  );

  router.post(
    "/:transactionId/delete",
    route("ApplePayController.POST /:transactionId/delete", "Failed to delete transaction", async (req, cr) =>
      cr.ok<ApplePayDeletedDto>(await svc.deleteTransaction(getUser(req).id, req.params.transactionId, req.logContext)),
    ),
  );

  router.post(
    "/:transactionId/restore",
    route("ApplePayController.POST /:transactionId/restore", "Failed to restore transaction", async (req, cr) =>
      cr.ok<ApplePayRestoredDto>(
        await svc.restoreTransaction(getUser(req).id, req.params.transactionId, req.logContext),
      ),
    ),
  );

  router.post(
    "/:transactionId/category",
    route("ApplePayController.POST /:transactionId/category", "Failed to update category", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { category } = validateCategoryBody(req.body, event);
      return cr.ok<ApplePayTransactionDto>(
        await svc.updateCategory(getUser(req).id, req.params.transactionId, category, req.logContext),
      );
    }),
  );

  router.post(
    "/card-label/:cardLast4",
    route("ApplePayController.POST /card-label/:cardLast4", "Failed to update card label", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { cardLast4, label } = validateCardLabelBody(req.params.cardLast4, req.body, event);
      return cr.ok<ApplePayCardLabelDto>(await svc.setCardLabel(getUser(req).id, cardLast4, label, req.logContext));
    }),
  );

  return router;
}
