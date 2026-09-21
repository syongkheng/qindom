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

      const { amount, merchant, name } = req.body;

      // The Shortcuts automation sends every field as text (Siri Shortcuts'
      // dictionary values are string by default), so amount arrives as e.g.
      // "12.50" rather than a JSON number — validate as a required string,
      // then parse to the real number the DB expects. occurred_dt is no
      // longer taken from the client at all — see recordTransaction, which
      // stamps it with the server's own clock instead.
      StructuralValidationUtilities.requiredString(amount, "amount", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.requiredString(merchant, "merchant", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.requiredString(name, "name", requestBodyStructuralValidationLoggingEvent);

      const parsedAmount = Number(amount);
      if (Number.isNaN(parsedAmount)) throw new Exceptions.InvalidRequest("amount", "format");

      const userId = logContext?.metadata?.userId as number;
      const serviceResponse = await service.recordTransaction(userId, parsedAmount, merchant, name, logContext);

      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "SsApplePayControllerV1.POST /ap/transaction", "Failed to record Apple Pay transaction");
    }
  });

  router.get("/ap/transaction", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const userId = logContext?.metadata?.userId as number;
      const serviceResponse = await service.getTransactions(userId, logContext);
      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "SsApplePayControllerV1.GET /ap/transaction", "Failed to retrieve Apple Pay transactions");
    }
  });

  return router;
}
