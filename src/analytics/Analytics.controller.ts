import { Router, Response } from "express";
import { z } from "zod";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { MandatoryTokenFilter, OptionalTokenFilter } from "../middlewares/TokenFilter.js";
import { adminLimiter, analyticsLimiter, analyticsReportLimiter } from "../middlewares/RateLimiter.js";
import { AnalyticsReportService, readKeyMatches } from "./AnalyticsReport.service.js";
import { REPORT_SITES, ReportRequest, reportRequestProblems } from "./AnalyticsReport.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { isOwner, PermissionService, ResourceType } from "../auth/Permission.js";
import { AnalyticSystemService } from "./AnalyticSystem.service.js";
import { AnalyticsDashboardService, MAX_SUMMARY_HOURS } from "./AnalyticsDashboard.service.js";
import {
  BreakpointSchema,
  isOriginAllowed,
  normaliseEvent,
  parseCollectRequest,
  SystemKeySchema,
} from "./AnalyticsContract.js";

/** Accounts that shared viewers log in with (awense.com). */
const VIEWER_ACCOUNT_SYSTEM = "fnd";

const UpsertSystemSchema = z.object({
  key: SystemKeySchema,
  displayName: z.string().trim().min(1).max(128),
  breakpoints: z.array(BreakpointSchema).min(1).max(12),
  allowedOrigins: z
    .array(z.string().regex(/^https?:\/\/[^/\s]+$/))
    .max(20)
    .default([]),
  active: z.boolean().default(true),
});

const GrantSchema = z.object({ username: z.string().trim().min(1).max(128) });

function resolveIp(req: RequestWithUserInfo): string {
  const raw = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Analytics v1 — mounted at /analytics alongside the legacy Heartbeat controller.
 *  POST /collect                                  public ingest (fixed contract, see AnalyticsContract.ts)
 *  POST /report                                   pdca.analytics.report/v1 (viewer key in x-analytics-key, see AnalyticsReport.ts)
 *  POST /admin/systems/:key/read-key              OWNER: rotate that viewer key (returned once)
 *  GET  /systems                                  systems the caller may view
 *  GET  /systems/:key/summary?hours=24            dashboard data (OWNER or granted viewer)
 *  GET  /admin/systems                            OWNER: full registry incl. disabled
 *  POST /admin/systems                            OWNER: create/update a system
 *  GET  /admin/systems/:key/access                OWNER: list viewers
 *  POST /admin/systems/:key/access                OWNER: grant by username
 *  POST /admin/systems/:key/access/:userId/revoke OWNER: revoke (POST — CORS allows GET/POST/DELETE, kept consistent with other admin writes)
 */
export default function createAnalyticsController(db: KnexSqlUtilities) {
  const router = Router();
  const systems = new AnalyticSystemService(db);
  const dashboard = new AnalyticsDashboardService(db);
  const reports = new AnalyticsReportService(db);
  const permissions = new PermissionService(db);

  router.post("/collect", [analyticsLimiter, OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const parsed = parseCollectRequest(req.body);
      if (!parsed.ok) throw new Exceptions.InvalidRequest(parsed.field, "format");

      const system = await systems.getActive(parsed.value.system);
      if (!system) throw new Exceptions.InvalidRequest("system");
      if (!isOriginAllowed(system, req.headers.origin))
        throw new Exceptions.ForbiddenAccess("Origin not allowed for this system");

      await dashboard.insert(normaliseEvent(system, parsed.value), {
        userId: req.user?.username ?? "",
        ipAddress: resolveIp(req),
        userAgent: req.headers["user-agent"] || "Unknown",
      });
      return cr.ok({ message: "Event recorded successfully." });
    } catch (err) {
      return handleException(err, cr, "AnalyticsController.POST /collect", "Failed to record analytic event");
    }
  });

  router.get("/systems", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const user = getUser(req);
      const active = await systems.listActive();
      const visible = isOwner(req)
        ? active
        : await permissions
            .grantedKeys(user.id, ResourceType.ANALYTICS_SYSTEM)
            .then((keys) => active.filter((s) => keys.includes(s.key)));
      return cr.ok(visible.map(({ key, displayName, breakpoints }) => ({ key, displayName, breakpoints })));
    } catch (err) {
      return handleException(err, cr, "AnalyticsController.GET /systems", "Failed to load analytics systems");
    }
  });

  router.get("/systems/:key/summary", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const key = String(req.params.key);
      // Same 403 for "doesn't exist" and "not yours" so keys can't be probed.
      const allowed = await permissions.canAccessResource(getUser(req), ResourceType.ANALYTICS_SYSTEM, key);
      const system = allowed ? await systems.getActive(key) : undefined;
      if (!system) throw new Exceptions.ForbiddenAccess();

      const hours = Math.min(Math.max(Math.trunc(Number(req.query.hours)) || 24, 1), MAX_SUMMARY_HOURS);
      return cr.ok(await dashboard.summary(system, hours));
    } catch (err) {
      return handleException(err, cr, "AnalyticsController.GET /systems/:key/summary", "Failed to load analytics");
    }
  });

  // Private dashboard data (pdca.analytics.report/v1). No user login: the site has no accounts, so
  // reads are authorised by the per-system viewer key in `x-analytics-key` (sha256 stored).
  router.post("/report", [analyticsReportLimiter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const problems = reportRequestProblems(req.body);
      if (problems.length) return cr.result(400, "Bad Request", { message: "Request rejected", problems });
      const request = req.body as ReportRequest;

      const systemKey = REPORT_SITES[request.site];
      const system = systemKey ? await systems.getActive(systemKey) : undefined;
      const presented = String(req.headers["x-analytics-key"] ?? "");
      // Same 403 for unknown system, wrong origin and wrong key, so nothing can be probed.
      if (!system || !isOriginAllowed(system, req.headers.origin)) throw new Exceptions.ForbiddenAccess();
      if (!readKeyMatches(presented, await reports.readKeyHash(system.key))) throw new Exceptions.ForbiddenAccess();

      const ownHosts = system.allowedOrigins.map((o) => new URL(o).hostname.replace(/^www\./, ""));
      return cr.ok(await reports.report(system.key, request, ownHosts));
    } catch (err) {
      return handleException(err, cr, "AnalyticsController.POST /report", "Failed to build the analytics report");
    }
  });

  // ── OWNER-only administration ──────────────────────────────────────────────

  // Rotates the viewer key for POST /report. The plain key is returned once; only its hash is kept.
  router.post(
    "/admin/systems/:key/read-key",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!isOwner(req)) return cr.result(403, "Forbidden", "Insufficient permissions");
        const readKey = await reports.rotateReadKey(String(req.params.key));
        if (!readKey) throw new Exceptions.NotFound();
        return cr.ok({ readKey });
      } catch (err) {
        return handleException(
          err,
          cr,
          "AnalyticsController.POST /admin/systems/:key/read-key",
          "Failed to rotate read key",
        );
      }
    },
  );

  router.get(
    "/admin/systems",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!isOwner(req)) return cr.result(403, "Forbidden", "Insufficient permissions");
        return cr.ok(await systems.listAll());
      } catch (err) {
        return handleException(err, cr, "AnalyticsController.GET /admin/systems", "Failed to load analytics systems");
      }
    },
  );

  router.post(
    "/admin/systems",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!isOwner(req)) return cr.result(403, "Forbidden", "Insufficient permissions");
        const parsed = UpsertSystemSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new Exceptions.InvalidRequest(parsed.error.issues[0]?.path.join(".") || "body", "format");
        }
        await systems.upsert(parsed.data);
        return cr.ok(await systems.listAll());
      } catch (err) {
        return handleException(err, cr, "AnalyticsController.POST /admin/systems", "Failed to save analytics system");
      }
    },
  );

  router.get(
    "/admin/systems/:key/access",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!isOwner(req)) return cr.result(403, "Forbidden", "Insufficient permissions");
        return cr.ok(await permissions.listGrants(ResourceType.ANALYTICS_SYSTEM, String(req.params.key)));
      } catch (err) {
        return handleException(
          err,
          cr,
          "AnalyticsController.GET /admin/systems/:key/access",
          "Failed to load access list",
        );
      }
    },
  );

  router.post(
    "/admin/systems/:key/access",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!isOwner(req)) return cr.result(403, "Forbidden", "Insufficient permissions");
        const key = String(req.params.key);
        if (!(await systems.listAll()).some((s) => s.key === key)) throw new Exceptions.NotFound();

        const parsed = GrantSchema.safeParse(req.body);
        if (!parsed.success) throw new Exceptions.InvalidRequest("username");
        const target = await db.findOne<ITB_AA_USER>(
          "tb_aa_user",
          { username_system: `${parsed.data.username}_${VIEWER_ACCOUNT_SYSTEM}`, record_status: "A" },
          ["id"],
        );
        if (!target?.id) return cr.result(404, "Not Found", "No awense.com account with that username");

        await permissions.grant(ResourceType.ANALYTICS_SYSTEM, key, target.id, getUser(req).id);
        return cr.ok(await permissions.listGrants(ResourceType.ANALYTICS_SYSTEM, key));
      } catch (err) {
        return handleException(
          err,
          cr,
          "AnalyticsController.POST /admin/systems/:key/access",
          "Failed to grant access",
        );
      }
    },
  );

  router.post(
    "/admin/systems/:key/access/:userId/revoke",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!isOwner(req)) return cr.result(403, "Forbidden", "Insufficient permissions");
        const key = String(req.params.key);
        const userId = Number(req.params.userId);
        if (!Number.isInteger(userId) || userId <= 0) return cr.result(400, "Bad Request", "Invalid user ID");
        await permissions.revoke(ResourceType.ANALYTICS_SYSTEM, key, userId);
        return cr.ok(await permissions.listGrants(ResourceType.ANALYTICS_SYSTEM, key));
      } catch (err) {
        return handleException(
          err,
          cr,
          "AnalyticsController.POST /admin/systems/:key/access/:userId/revoke",
          "Failed to revoke access",
        );
      }
    },
  );

  return router;
}
