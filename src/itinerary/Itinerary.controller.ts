import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { ItineraryService } from "./Itinerary.service.js";
import { ItineraryValidator } from "./Itinerary.validator.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";

function extractIp(req: Request): string {
  const raw = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function createItineraryController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new ItineraryService(db);

  router.get("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const myTrips = await svc.listTrips(getUser(req).id);
      return cr.ok({ myTrips, sharedTrips: [] });
    } catch (err) {
      return handleException(err, cr, "ItineraryController.GET /", "Failed to load itineraries");
    }
  });

  router.post("/delete/:sessionId", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      await svc.deleteTrip(getUser(req).id, req.params.sessionId);
      return cr.ok({ deleted: true });
    } catch (err) {
      return handleException(err, cr, "ItineraryController.POST /delete/:sessionId", "Failed to delete itinerary");
    }
  });

  router.post("/challenge", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { shortCode, challenge } = ItineraryValidator.validateChallengeRequest(req.body, validationEvent);
      const result = await svc.verifyChallenge(shortCode, challenge);
      void svc.recordView(shortCode, extractIp(req), (req.headers["user-agent"] || "Unknown").slice(0, 512));
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ItineraryController.POST /challenge", "Failed to verify challenge");
    }
  });

  router.post("/add-collaborator", async (_req: Request, res: Response) => {
    return new ControllerResponse(_req, res).ok({ added: false, message: "Not yet implemented" });
  });

  router.post("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const body = ItineraryValidator.validateCreateRequest(req.body, validationEvent);
      const result = await svc.create(getUser(req).id, body);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ItineraryController.POST /", "Failed to create itinerary");
    }
  });

  router.get("/v/:shortCode", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const result = await svc.getByShortCode(req.params.shortCode);
      if (!("hasChallenge" in result)) {
        void svc.recordView(req.params.shortCode, extractIp(req), (req.headers["user-agent"] || "Unknown").slice(0, 512));
      }
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ItineraryController.GET /v/:shortCode", "Failed to load itinerary");
    }
  });

  router.get("/:sessionId", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const result = await svc.getBySessionId(getUser(req).id, req.params.sessionId);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ItineraryController.GET /:sessionId", "Failed to load itinerary");
    }
  });

  router.post("/edit/:sessionId", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const body = ItineraryValidator.validateEditRequest(req.body, validationEvent);
      const result = await svc.edit(getUser(req).id, req.params.sessionId, body);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ItineraryController.POST /edit/:sessionId", "Failed to update itinerary");
    }
  });

  return router;
}
