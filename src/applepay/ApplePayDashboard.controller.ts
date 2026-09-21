import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { SsApplePayV1Service } from "../siri-shortcut/ApplePay.v1.service.js";
import { ApplePayDashboardValidator } from "./ApplePayDashboard.validator.js";

// Authenticated web dashboard for transactions logged by the Apple Pay
// Shortcuts automation (see siri-shortcut/ApplePay.v1.controller.ts, which
// stays API-key-gated for the Shortcut itself). Reuses the same service.
export default function createApplePayDashboardController(db: KnexSqlUtilities) {
  const router = Router();
  const service = new SsApplePayV1Service(db);

  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const result = await service.getTransactions(getUser(req).id, req.logContext);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ApplePayDashboardController.GET /", "Failed to load transactions");
    }
  });

  router.post("/:transactionId/category", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { category } = ApplePayDashboardValidator.validateUpdateCategoryRequest(req.body, validationEvent);
      const result = await service.updateCategory(getUser(req).id, req.params.transactionId, category, logContext);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ApplePayDashboardController.POST /:transactionId/category", "Failed to update category");
    }
  });

  return router;
}
