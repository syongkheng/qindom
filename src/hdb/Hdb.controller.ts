import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import { getUser, requireRole, route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Roles } from "../auth/Permission.js";
import { HdbService } from "./Hdb.service.js";
import { HdbCoordinateService } from "./HdbCoordinate.service.js";
import {
  validateAddressBody,
  validateCoordinatesUpdateBody,
  validateNearbyBusStopsQuery,
  validateNearestMrtStationsQuery,
  validatePphsListQuery,
} from "./Hdb.validator.js";
import {
  CoordinateOptionDto,
  CoordinatesClearedDto,
  CoordinatesUpdatedDto,
  NearbyBusStopsDto,
  NearestMrtStationsDto,
  PphsListDto,
  ResolvedCoordinatesDto,
} from "./Hdb.types.js";

/** Who may change PPHS coordinates. */
const COORDINATE_ADMIN_ROLES = [Roles.PPHS_ADMIN, Roles.OWNER];

/**
 * Mounted under `mw.std` (public): the reads are open; the coordinate admin routes add
 * MandatoryTokenFilter per route + a PPHS_R5 / SYSTEM_R5 role check.
 */
export default function createHdbController(db: KnexSqlUtilities): Router {
  const router = Router();
  const hdbSvc = new HdbService(db);
  const coordinateSvc = new HdbCoordinateService(db);

  // ── Public reads ──

  router.get(
    "/pphs",
    route("HdbController.GET /pphs", "Failed to fetch PPHS", async (req, cr) => {
      const { batch } = validatePphsListQuery(
        req.query,
        LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request query"),
      );
      return cr.ok<PphsListDto>(await hdbSvc.listPphs(batch, req.logContext));
    }),
  );

  router.get(
    "/pphs/busstops",
    route("HdbController.GET /pphs/busstops", "Failed to fetch bus stops", async (req, cr) => {
      const query = validateNearbyBusStopsQuery(
        req.query,
        LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request query"),
      );
      return cr.ok<NearbyBusStopsDto>(await hdbSvc.findBusStopsNear(query, req.logContext));
    }),
  );

  router.get(
    "/pphs/mrt",
    route("HdbController.GET /pphs/mrt", "Failed to fetch MRT stations", async (req, cr) => {
      const query = validateNearestMrtStationsQuery(
        req.query,
        LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request query"),
      );
      return cr.ok<NearestMrtStationsDto>(await hdbSvc.findNearestMrtStations(query, req.logContext));
    }),
  );

  // ── Coordinate admin (JWT + role) ──

  router.post(
    "/pphs/update",
    MandatoryTokenFilter,
    route("HdbController.POST /pphs/update", "Failed to update coordinates", async (req, cr) => {
      requireRole(req, ...COORDINATE_ADMIN_ROLES);
      const body = validateCoordinatesUpdateBody(
        req.body,
        LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body"),
      );
      return cr.ok<CoordinatesUpdatedDto>(await coordinateSvc.update(body, getUser(req).username, req.logContext));
    }),
  );

  router.post(
    "/pphs/clear-coordinates",
    MandatoryTokenFilter,
    route("HdbController.POST /pphs/clear-coordinates", "Failed to clear coordinates", async (req, cr) => {
      requireRole(req, ...COORDINATE_ADMIN_ROLES);
      const { address } = validateAddressBody(
        req.body,
        LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body"),
      );
      return cr.ok<CoordinatesClearedDto>(await coordinateSvc.clear(address, req.logContext));
    }),
  );

  router.post(
    "/pphs/geocode-options",
    MandatoryTokenFilter,
    route("HdbController.POST /pphs/geocode-options", "Failed to fetch coordinate options", async (req, cr) => {
      requireRole(req, ...COORDINATE_ADMIN_ROLES);
      const { address } = validateAddressBody(
        req.body,
        LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body"),
      );
      return cr.ok<CoordinateOptionDto[]>(await coordinateSvc.listOptions(address, req.logContext));
    }),
  );

  router.post(
    "/pphs/refresh",
    MandatoryTokenFilter,
    route("HdbController.POST /pphs/refresh", "Failed to refresh coordinates", async (req, cr) => {
      requireRole(req, ...COORDINATE_ADMIN_ROLES);
      const { address } = validateAddressBody(
        req.body,
        LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body"),
      );
      return cr.ok<ResolvedCoordinatesDto>(await coordinateSvc.refresh(address, req.logContext));
    }),
  );

  return router;
}
