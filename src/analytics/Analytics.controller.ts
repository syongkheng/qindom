import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, requireRole, route } from "../utils/requestUtils.js";
import { MandatoryTokenFilter, OptionalTokenFilter } from "../middlewares/TokenFilter.js";
import { adminLimiter, analyticsLimiter, analyticsReportLimiter } from "../middlewares/RateLimiter.js";
import { Roles } from "../auth/Permission.js";
import { AnalyticsSystemService } from "./AnalyticsSystem.service.js";
import { AnalyticsDashboardService } from "./AnalyticsDashboard.service.js";
import { AnalyticsReportService } from "./AnalyticsReport.service.js";
import { AnalyticsAccessService } from "./AnalyticsAccess.service.js";
import { reportRequestProblems } from "./AnalyticsReport.js";
import {
  parseSummaryHours,
  readRequestMeta,
  validateCollectBody,
  validateGrantBody,
  validateSystemBody,
  validateUserIdParam,
} from "./Analytics.validator.js";
import {
  AnalyticsGrantDto,
  AnalyticsReadKeyDto,
  AnalyticsRecordedDto,
  AnalyticsReportBody,
  AnalyticsReportDto,
  AnalyticsSummaryDto,
  AnalyticsSystemAdminDto,
  AnalyticsSystemDto,
} from "./Analytics.types.js";

const REPORT_KEY_HEADER = "x-analytics-key";
const BAD_REQUEST = 400;

/**
 * Analytics v1, mounted at /analytics (`mw.std`) after the deprecated AnalyticsLegacy controller.
 * Public routes have their own limiters; JWT is per route because the router mixes both.
 *  POST /collect                                  public ingest (fixed contract, see AnalyticsContract.ts)
 *  POST /report                                   pdca.analytics.report/v1 (viewer key in x-analytics-key, see AnalyticsReport.ts)
 *  GET  /systems                                  systems the caller may view
 *  GET  /systems/:key/summary?hours=24            dashboard data (OWNER or granted viewer)
 *  POST /admin/systems/:key/read-key              OWNER: rotate that viewer key (returned once)
 *  GET  /admin/systems                            OWNER: full registry incl. disabled
 *  POST /admin/systems                            OWNER: create/update a system
 *  GET  /admin/systems/:key/access                OWNER: list viewers
 *  POST /admin/systems/:key/access                OWNER: grant by username
 *  POST /admin/systems/:key/access/:userId/revoke OWNER: revoke
 */
export default function createAnalyticsController(db: KnexSqlUtilities): Router {
  const router = Router();
  const systems = new AnalyticsSystemService(db);
  const dashboard = new AnalyticsDashboardService(db, systems);
  const reports = new AnalyticsReportService(db, systems);
  const access = new AnalyticsAccessService(db, systems);

  router.post(
    "/collect",
    analyticsLimiter,
    OptionalTokenFilter,
    route("AnalyticsController.POST /collect", "Failed to record analytic event", async (req, cr) => {
      const body = validateCollectBody(req.body);
      await dashboard.collect(body, req.headers.origin, readRequestMeta(req), req.logContext);
      return cr.ok<AnalyticsRecordedDto>({ message: "Event recorded successfully." });
    }),
  );

  router.get(
    "/systems",
    MandatoryTokenFilter,
    route("AnalyticsController.GET /systems", "Failed to load analytics systems", async (req, cr) =>
      cr.ok<AnalyticsSystemDto[]>(await access.visibleSystems(getUser(req), req.logContext)),
    ),
  );

  router.get(
    "/systems/:key/summary",
    MandatoryTokenFilter,
    route("AnalyticsController.GET /systems/:key/summary", "Failed to load analytics", async (req, cr) => {
      const system = await access.viewableSystem(getUser(req), String(req.params.key), req.logContext);
      const hours = parseSummaryHours(req.query.hours);
      return cr.ok<AnalyticsSummaryDto>(await dashboard.summary(system, hours, req.logContext));
    }),
  );

  // Private dashboard data (pdca.analytics.report/v1). No user login: the site has no accounts, so
  // reads are authorised by the per-system viewer key in `x-analytics-key` (sha256 stored).
  router.post(
    "/report",
    analyticsReportLimiter,
    route("AnalyticsController.POST /report", "Failed to build the analytics report", async (req, cr) => {
      const problems = reportRequestProblems(req.body);
      // Frozen contract: a bad request answers `{ message, problems[] }` (same messages as the PDCA site's
      // own validator), not the registry error shape.
      if (problems.length) return cr.result(BAD_REQUEST, "Bad Request", { message: "Request rejected", problems });
      const body = req.body as AnalyticsReportBody;
      const presentedKey = String(req.headers[REPORT_KEY_HEADER] ?? "");
      const system = await reports.authorise(body.site, req.headers.origin, presentedKey, req.logContext);
      return cr.ok<AnalyticsReportDto>(await reports.report(system, body, req.logContext));
    }),
  );

  // ── OWNER-only administration ──────────────────────────────────────────────

  // Rotates the viewer key for POST /report. The plain key is returned once; only its hash is kept.
  router.post(
    "/admin/systems/:key/read-key",
    MandatoryTokenFilter,
    adminLimiter,
    route("AnalyticsController.POST /admin/systems/:key/read-key", "Failed to rotate read key", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      return cr.ok<AnalyticsReadKeyDto>(await reports.rotateReadKey(String(req.params.key), req.logContext));
    }),
  );

  router.get(
    "/admin/systems",
    MandatoryTokenFilter,
    adminLimiter,
    route("AnalyticsController.GET /admin/systems", "Failed to load analytics systems", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      return cr.ok<AnalyticsSystemAdminDto[]>(await systems.listAdmin(req.logContext));
    }),
  );

  router.post(
    "/admin/systems",
    MandatoryTokenFilter,
    adminLimiter,
    route("AnalyticsController.POST /admin/systems", "Failed to save analytics system", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      await systems.upsert(validateSystemBody(req.body), req.logContext);
      return cr.ok<AnalyticsSystemAdminDto[]>(await systems.listAdmin(req.logContext));
    }),
  );

  router.get(
    "/admin/systems/:key/access",
    MandatoryTokenFilter,
    adminLimiter,
    route("AnalyticsController.GET /admin/systems/:key/access", "Failed to load access list", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      return cr.ok<AnalyticsGrantDto[]>(await access.listGrants(String(req.params.key)));
    }),
  );

  router.post(
    "/admin/systems/:key/access",
    MandatoryTokenFilter,
    adminLimiter,
    route("AnalyticsController.POST /admin/systems/:key/access", "Failed to grant access", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      const key = String(req.params.key);
      await access.requireSystem(key, req.logContext); // 404 before the body's 400, as before
      const { username } = validateGrantBody(req.body);
      return cr.ok<AnalyticsGrantDto[]>(await access.grant(key, username, getUser(req).id, req.logContext));
    }),
  );

  router.post(
    "/admin/systems/:key/access/:userId/revoke",
    MandatoryTokenFilter,
    adminLimiter,
    route(
      "AnalyticsController.POST /admin/systems/:key/access/:userId/revoke",
      "Failed to revoke access",
      async (req, cr) => {
        requireRole(req, Roles.OWNER);
        const userId = validateUserIdParam(req.params.userId);
        return cr.ok<AnalyticsGrantDto[]>(await access.revoke(String(req.params.key), userId));
      },
    ),
  );

  return router;
}
