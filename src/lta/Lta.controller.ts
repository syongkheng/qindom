import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { LtaService } from "./Lta.service.js";
import { validateBusStopCodeQuery } from "./Lta.validator.js";
import { BusArrivalsDto, BusServicesDto } from "./Lta.types.js";

/** Public bus data (mounted under `mw.std`): live arrivals from LTA DataMall and stored bus routes. */
export default function createLtaController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new LtaService(db);

  router.get(
    "/timing",
    route("LtaController.GET /timing", "Failed to fetch bus timings", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request query");
      const { busStopCode } = validateBusStopCodeQuery(req.query as Record<string, unknown>, event);
      return cr.ok<BusArrivalsDto>(await svc.getBusArrivals(busStopCode, req.logContext));
    }),
  );

  router.get(
    "/bus/services",
    route("LtaController.GET /bus/services", "Failed to fetch bus services", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request query");
      const { busStopCode } = validateBusStopCodeQuery(req.query as Record<string, unknown>, event);
      return cr.ok<BusServicesDto>(await svc.listBusServices(busStopCode, req.logContext));
    }),
  );

  return router;
}
