import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LtaService } from "./Lta.service";
import { Exceptions } from "../exceptions/AppExceptions";
import { handleException } from "../utils/requestUtils";

export default function createLtaController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new LtaService(db);

  router.get("/timing", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { busStopCode } = req.query;
      if (!busStopCode) throw new Exceptions.InvalidRequest("busStopCode");
      return cr.ok(await svc.statistics(busStopCode as string));
    } catch (err) {
      return handleException(err, cr, "LtaController.GET /timing", "Failed to fetch bus timings");
    }
  });

  router.post("/bus/services", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { busStopCode } = req.body as { busStopCode: string };
      return cr.ok(await svc.retrieveBusServicesByBusStopCode(busStopCode));
    } catch (err) {
      return handleException(err, cr, "LtaController.POST /bus/services", "Failed to fetch bus services");
    }
  });

  return router;
}
