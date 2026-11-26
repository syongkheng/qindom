import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { LtaService } from "./Lta.service.js";
import {
  validateBusStopCodeQuery,
  validateNearbyBusStopsQuery,
  validateNearestMrtStationsQuery,
} from "./Lta.validator.js";
import { BusArrivalsDto, BusServicesDto, NearbyBusStopsDto, NearestMrtStationsDto } from "./Lta.types.js";

/**
 * Public transport data (mounted under `mw.std`): live arrivals from LTA DataMall, stored bus routes,
 * and the bus stops / MRT stations near a point.
 */
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

  router.get(
    "/bus-stops/nearby",
    route("LtaController.GET /bus-stops/nearby", "Failed to fetch bus stops", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request query");
      const query = validateNearbyBusStopsQuery(req.query as Record<string, unknown>, event);
      return cr.ok<NearbyBusStopsDto>(await svc.findBusStopsNear(query, req.logContext));
    }),
  );

  router.get(
    "/mrt-stations/nearest",
    route("LtaController.GET /mrt-stations/nearest", "Failed to fetch MRT stations", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request query");
      const query = validateNearestMrtStationsQuery(req.query as Record<string, unknown>, event);
      return cr.ok<NearestMrtStationsDto>(await svc.findNearestMrtStations(query, req.logContext));
    }),
  );

  return router;
}
