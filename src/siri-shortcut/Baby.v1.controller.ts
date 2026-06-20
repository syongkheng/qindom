import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { SsBabyV1Service } from "./Baby.v1.service.js";
import { SsBabyV1Validator } from "./Baby.v1.validator.js";

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
      return handleException(err, cr, "SsBabyControllerV1.POST /baby/feeding", "Failed to record feeding");
    }
  });

  router.post("/baby/diaper", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      // Request Structure Validation

      const requestBodyStructuralValidationLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;

      const diaperChangeRequest = SsBabyV1Validator.validateDiaperChangeRequest(
        req.body,
        requestBodyStructuralValidationLoggingEvent,
      );

      // Calling of service
      const serviceResponse = await ssBabyServiceV1.recordDiaperChange(diaperChangeRequest, logContext);

      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "SsBabyControllerV1.POST /baby/diaper", "Failed to record diaper change");
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
      return handleException(err, cr, "SsBabyControllerV1.GET /baby/feeding", "Failed to retrieve feeding records");
    }
  });

  router.get("/baby/diaper", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      // Calling of service
      const serviceResponse = await ssBabyServiceV1.getDiaperRecords(logContext);

      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "SsBabyControllerV1.GET /baby/diaper", "Failed to retrieve diaper records");
    }
  });

  return router;
}
