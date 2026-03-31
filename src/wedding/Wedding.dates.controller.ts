import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { WeddingService } from "./Wedding.service";
import { WeddingValidator } from "./Wedding.validator";
import { getUser, handleException } from "../utils/requestUtils";

export function createWeddingDatesRouter(svc: WeddingService): Router {
  const router = Router();

  router.get("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const sessions = await svc.listSessions(getUser(req).username);
      return cr.ok({ sessions });
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.GET /", "Failed to load sessions");
    }
  });

  router.post("/session", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { title } = WeddingValidator.validateCreateSessionRequest(req);
      const session = await svc.createSession(getUser(req).username, title);
      return cr.ok({ session });
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.POST /session", "Failed to create session");
    }
  });

  router.post("/session/delete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = WeddingValidator.validateIdRequest(req);
      const deleted = await svc.deleteSession(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Session not found or not owned by you");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.POST /session/delete", "Failed to delete session");
    }
  });

  router.post("/date", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { session_id, date, ceremony_type, auspicious_notes } = WeddingValidator.validateAddDateRequest(req);
      const weddingDate = await svc.addDate(getUser(req).username, {
        sessionId:       session_id,
        date,
        ceremonyType:    ceremony_type,
        auspiciousNotes: auspicious_notes ?? null,
      });
      return cr.ok({ date: weddingDate });
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.POST /date", "Failed to add date");
    }
  });

  router.post("/date/update", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id, date, ceremony_type, auspicious_notes, status } = WeddingValidator.validateUpdateDateRequest(req);
      const updated = await svc.updateDate(getUser(req).username, id, {
        date,
        ceremonyType:    ceremony_type,
        auspiciousNotes: auspicious_notes,
        status,
      });
      if (!updated) return cr.result(404, "Not Found", "Date not found");
      return cr.ok({ date: updated });
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.POST /date/update", "Failed to update date");
    }
  });

  router.post("/date/delete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = WeddingValidator.validateIdRequest(req);
      const deleted = await svc.deleteDate(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Date not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.POST /date/delete", "Failed to delete date");
    }
  });

  router.post("/comment/delete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = WeddingValidator.validateIdRequest(req);
      const deleted = await svc.deleteComment(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Comment not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.POST /comment/delete", "Failed to delete comment");
    }
  });

  // ── Public routes (no token required) ────────────────────────────────────────
  // Must be registered after all static sub-paths to avoid /:shortCode swallowing them.

  router.get("/:shortCode", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const session = await svc.getSessionByShortCode(req.params.shortCode);
      if (!session) return cr.result(404, "Not Found", "Session not found");
      return cr.ok({ session });
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.GET /:shortCode", "Failed to load session");
    }
  });

  router.post("/:shortCode/comment", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { date_id, commenter_name, comment } = WeddingValidator.validatePublicCommentRequest(req);
      const session = await svc.getSessionByShortCode(req.params.shortCode);
      if (!session) return cr.result(404, "Not Found", "Session not found");
      const dateExists = session.dates.some((d) => d.id === date_id);
      if (!dateExists) return cr.result(400, "Bad Request", "date_id does not belong to this session");
      const newComment = await svc.addComment(date_id, commenter_name, comment);
      return cr.ok({ comment: newComment });
    } catch (err) {
      return handleException(err, cr, "WeddingDatesController.POST /:shortCode/comment", "Failed to add comment");
    }
  });

  return router;
}
