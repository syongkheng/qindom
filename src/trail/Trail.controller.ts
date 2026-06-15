import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { TrailService } from "./Trail.service";
import { TrailValidator } from "./Trail.validator";
import { getUser, handleException } from "../utils/requestUtils";

export default function createTrailController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new TrailService(db);

  // List sessions
  router.get("/sessions", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const sessions = await svc.getSessions(getUser(req).id);
      return cr.ok(sessions);
    } catch (err) {
      return handleException(err, cr, "TrailController.GET /sessions", "Failed to load trail sessions");
    }
  });

  // Create session
  router.post("/sessions", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const body = TrailValidator.validateCreateSession(req);
      const session = await svc.createSession(getUser(req).id, body);
      return cr.ok(session);
    } catch (err) {
      return handleException(err, cr, "TrailController.POST /sessions", "Failed to create trail session");
    }
  });

  // Get session by id
  router.get("/sessions/:sessionId", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const session = await svc.getSessionById(req.params.sessionId, getUser(req).id);
      return cr.ok(session);
    } catch (err) {
      return handleException(err, cr, "TrailController.GET /sessions/:sessionId", "Failed to load trail session");
    }
  });

  // Complete session
  router.post("/sessions/:sessionId/complete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const body = TrailValidator.validateCompleteSession(req);
      const session = await svc.completeSession(req.params.sessionId, getUser(req).id, body);
      return cr.ok(session);
    } catch (err) {
      return handleException(err, cr, "TrailController.POST /sessions/:sessionId/complete", "Failed to complete trail session");
    }
  });

  // Delete session (soft)
  router.post("/sessions/:sessionId/delete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      await svc.deleteSession(req.params.sessionId, getUser(req).id);
      return cr.ok({ deleted: true });
    } catch (err) {
      return handleException(err, cr, "TrailController.POST /sessions/:sessionId/delete", "Failed to delete trail session");
    }
  });

  // List custom trails
  router.get("/custom", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const trails = await svc.getCustomTrails(getUser(req).id);
      return cr.ok(trails);
    } catch (err) {
      return handleException(err, cr, "TrailController.GET /custom", "Failed to load custom trails");
    }
  });

  // Create custom trail
  router.post("/custom", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const body = TrailValidator.validateCreateCustomTrail(req);
      const trail = await svc.createCustomTrail(getUser(req).id, body);
      return cr.ok(trail);
    } catch (err) {
      return handleException(err, cr, "TrailController.POST /custom", "Failed to create custom trail");
    }
  });

  return router;
}
