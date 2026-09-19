import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { GarminValidator } from "./Garmin.validator.js";
import { GarminService } from "./Garmin.service.js";
import { handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";

export default function createGarminController(db: KnexSqlUtilities) {
  const router = Router();
  const garminValidator = new GarminValidator();
  const garminService = new GarminService(db);

  // Today's intraday stress/body-battery/heart-rate series + last night's sleep.
  router.get("/today", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const today = await garminService.getToday();
      return cr.ok(today);
    } catch (err) {
      return handleException(err, cr, "GarminController.GET /today", "Failed to fetch today's Garmin data");
    }
  });

  // Historical daily summaries for trend charts, oldest → newest.
  router.get("/summary", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext: IRequestLogContext = req.logContext;

    const validationEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Query params")
      : undefined;

    try {
      const days = garminValidator.validateSummaryQuery(req, validationEvent);
      const summary = await garminService.getSummary(days);
      return cr.ok(summary);
    } catch (err) {
      return handleException(err, cr, "GarminController.GET /summary", "Failed to fetch Garmin summary");
    }
  });

  return router;
}
