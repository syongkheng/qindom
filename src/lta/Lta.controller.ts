import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LtaService } from "./Lta.service.js";
import { LtaValidator } from "./Lta.validator.js";
import { handleException } from "../utils/requestUtils.js";

export default function createLtaController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new LtaService(db);

  router.get("/timing", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { busStopCode } = LtaValidator.validateBusStopCodeFromQuery(req);
      return cr.ok(await svc.statistics(busStopCode));
    } catch (err) {
      return handleException(err, cr, "LtaController.GET /timing", "Failed to fetch bus timings");
    }
  });

  router.post("/bus/services", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { busStopCode } = LtaValidator.validateBusStopCodeFromBody(req);
      return cr.ok(await svc.retrieveBusServicesByBusStopCode(busStopCode));
    } catch (err) {
      return handleException(err, cr, "LtaController.POST /bus/services", "Failed to fetch bus services");
    }
  });

  return router;
}
