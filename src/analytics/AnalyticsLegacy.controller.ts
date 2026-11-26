import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { route } from "../utils/RequestUtilities.js";
import { OptionalTokenFilter } from "../middlewares/TokenFilter.js";
import { AnalyticsLegacyService } from "./AnalyticsLegacy.service.js";
import { readRequestMeta, validateHeartbeatBody, validateLegacyEventBody } from "./Analytics.validator.js";
import { AnalyticsRecordedDto } from "./Analytics.types.js";

const ANONYMOUS_USER = "Anonymous";

/**
 * DEPRECATED analytics ingest, mounted at /analytics before the v1 controller (Analytics.controller.ts).
 * Kept so old clients keep working; request/response shapes are frozen.
 *  POST /           loose event (only event/sessionId/system required)
 *  POST /heartbeat  session last-seen upsert (fndom still sends it every 30 s)
 */
export default function createAnalyticsLegacyController(db: KnexSqlUtilities): Router {
  const router = Router();
  const legacy = new AnalyticsLegacyService(db);

  router.post(
    "/",
    OptionalTokenFilter,
    route("AnalyticsLegacyController.POST /", "Failed to record analytic event", async (req, cr) => {
      const body = validateLegacyEventBody(req.body);
      await legacy.recordEvent(body, readRequestMeta(req), req.logContext);
      return cr.ok<AnalyticsRecordedDto>({ message: "Event recorded successfully." });
    }),
  );

  router.post(
    "/heartbeat",
    OptionalTokenFilter,
    route("AnalyticsLegacyController.POST /heartbeat", "Failed to record heartbeat", async (req, cr) => {
      const body = validateHeartbeatBody(req.body);
      const { ipAddress, userAgent } = readRequestMeta(req);
      await legacy.recordHeartbeat(
        body,
        req.user?.username ?? ANONYMOUS_USER,
        { ipAddress, userAgent },
        req.logContext,
      );
      return cr.ok<AnalyticsRecordedDto>({ message: "Heartbeat recorded successfully." });
    }),
  );

  return router;
}
