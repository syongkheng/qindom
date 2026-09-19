import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { SsApplePayV1Service } from "./ApplePay.v1.service.js";

export default function createSsApplePayControllerV1(db: KnexSqlUtilities) {
  const router = Router();
  const service = new SsApplePayV1Service(db);

  // Called by the "When Apple Pay is used" Shortcuts automation.
  router.post("/ap/transaction", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      const requestBodyStructuralValidationLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;

      const { amount, merchant, timestamp, name } = req.body;

      StructuralValidationUtilities.requiredNumber(amount, "amount", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.requiredString(merchant, "merchant", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.requiredNumber(timestamp, "timestamp", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.requiredString(name, "name", requestBodyStructuralValidationLoggingEvent);

      const serviceResponse = await service.recordTransaction(amount, merchant, name, timestamp, logContext);

      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "SsApplePayControllerV1.POST /ap/transaction", "Failed to record Apple Pay transaction");
    }
  });

  router.get("/ap/transaction", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const serviceResponse = await service.getTransactions(logContext);
      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "SsApplePayControllerV1.GET /ap/transaction", "Failed to retrieve Apple Pay transactions");
    }
  });

  return router;
}
