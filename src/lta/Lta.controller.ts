import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LtaService } from "./Lta.service.js";
import { LtaValidator } from "./Lta.validator.js";
import { handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";

export default function createLtaController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new LtaService(db);

  router.get("/timing", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request query")
        : undefined;
      const { busStopCode } = LtaValidator.validateBusStopCodeFromQuery(req.query as Record<string, unknown>, validationEvent);
      return cr.ok(await svc.statistics(busStopCode));
    } catch (err) {
      return handleException(err, cr, "LtaController.GET /timing", "Failed to fetch bus timings");
    }
  });

  router.post("/bus/services", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { busStopCode } = LtaValidator.validateBusStopCodeFromBody(req.body, validationEvent);
      return cr.ok(await svc.retrieveBusServicesByBusStopCode(busStopCode));
    } catch (err) {
      return handleException(err, cr, "LtaController.POST /bus/services", "Failed to fetch bus services");
    }
  });

  return router;
}
