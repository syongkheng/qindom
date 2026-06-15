import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { handleException } from "../utils/requestUtils";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities";
import { IRequestLogContext } from "../models/IRequestLogContext";
import { SsBabyV1Service } from "./Baby.v1.service";

export default function createSsBabyControllerV1(db: KnexSqlUtilities) {
  const router = Router();
  const ssBabyServiceV1 = new SsBabyV1Service(db);

  router.post("/baby/feeding", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      // Request Structure Validation

      const requestBodyStructuralValidationLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { timing, qty } = req.body;

      StructuralValidationUtilities.required(timing, "timing", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.string(timing, "timing", requestBodyStructuralValidationLoggingEvent);

      StructuralValidationUtilities.required(qty, "qty", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.string(qty, "qty", requestBodyStructuralValidationLoggingEvent);

      // Calling of service
      const serviceResponse = await ssBabyServiceV1.recordFeeding(timing, qty, logContext);

      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "LlmControllerV1.POST /message", "Failed to record message");
    }
  });

  router.post("/baby/diaper", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const requestBodyStructuralValidationLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;

      // For simplicity, we will just echo back the diaper change record without saving to DB

      const { timing, type } = req.body;

      StructuralValidationUtilities.required(timing, "timing", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.string(timing, "timing", requestBodyStructuralValidationLoggingEvent);

      StructuralValidationUtilities.required(type, "type", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.string(type, "type", requestBodyStructuralValidationLoggingEvent);

      return cr.ok({
        echo: {
          timing,
          type,
        },
      });
    } catch (err) {
      return handleException(err, cr, "LlmControllerV1.POST /baby/diaper", "Failed to record diaper change");
    }
  });

  router.get("/baby/feeding", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      // Calling of service
      const serviceResponse = await ssBabyServiceV1.getFeedingRecords(logContext);

      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "LlmControllerV1.GET /message", "Failed to retrieve message");
    }
  });

  return router;
}
