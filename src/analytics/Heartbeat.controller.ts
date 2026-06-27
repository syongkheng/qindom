import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { AnalyticEventService } from "./AnalyticEvent.service.js";
import { HeartbeatService } from "./Heartbeat.service.js";
import { OptionalTokenFilter } from "../middlewares/TokenFilter.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { handleException } from "../utils/requestUtils.js";

export default function createHeartbeatController(db: KnexSqlUtilities) {
  const router = Router();
  const eventSvc = new AnalyticEventService(db);
  const heartbeatSvc = new HeartbeatService(db);

  function resolveIp(req: RequestWithUserInfo): string {
    const raw = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";
    return Array.isArray(raw) ? raw[0] : raw;
  }

  // POST /api/analytics — ingest a structured event from any frontend system.
  // Mirrors the mock server's POST /analytics so frontends switch between dev/prod
  // by changing only VITE_ANALYTICS_ENDPOINT; no route change needed.
  router.post("/", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { event, properties, page, referrer, sessionId, timestamp, system } = req.body;
      if (!event)     throw new Exceptions.InvalidRequest("event");
      if (!sessionId) throw new Exceptions.InvalidRequest("sessionId");
      if (!system)    throw new Exceptions.InvalidRequest("system");

      await eventSvc.insertEvent({
        event,
        properties: properties ?? {},
        page:       page     ?? "",
        referrer:   referrer ?? "",
        sessionId,
        userId:    req.user?.username ?? "",
        ipAddress: resolveIp(req),
        userAgent: req.headers["user-agent"] || "Unknown",
        system,
        timestamp: typeof timestamp === "string" ? new Date(timestamp).getTime() : (timestamp ?? Date.now()),
      });
      return cr.ok({ message: "Event recorded successfully." });
    } catch (err) {
      return handleException(err, cr, "HeartbeatController.POST /", "Failed to record analytic event");
    }
  });

  // POST /api/analytics/heartbeat — legacy session-activity ping, kept for compatibility.
  router.post("/heartbeat", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { sessionId, system } = req.body;
      if (!sessionId) throw new Exceptions.InvalidRequest("sessionId");
      if (!system)    throw new Exceptions.InvalidRequest("system");

      await heartbeatSvc.insertHeartbeatRecord({
        sessionId,
        username:  req.user?.username ?? "Anonymous",
        ipAddress: resolveIp(req),
        userAgent: req.headers["user-agent"] || "Unknown",
        system,
      });
      return cr.ok({ message: "Heartbeat recorded successfully." });
    } catch (err) {
      return handleException(err, cr, "HeartbeatController.POST /heartbeat", "Failed to record heartbeat");
    }
  });

  return router;
}
