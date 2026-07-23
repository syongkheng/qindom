import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { SuggestionService } from "./Suggestion.service.js";
import { SuggestionValidator } from "./Suggestion.validator.js";
import { handleException, hasRole } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

export default function createSuggestionController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new SuggestionService(db);

  // GET /api/suggestion/activity?destination=Singapore
  router.get("/activity", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Query") : undefined;
    try {
      const { destination } = SuggestionValidator.validateActivitySearch(
        req.query as Record<string, unknown>,
        event,
      );
      const activities = await svc.searchActivities(destination, event);
      return cr.ok(activities);
    } catch (err) {
      return handleException(err, cr, "SuggestionController.GET /activity", "Failed to fetch activity suggestions");
    }
  });

  // POST /api/suggestion/activity (admin)
  router.post("/activity", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Body") : undefined;
    try {
      const data = SuggestionValidator.validateCreateActivity(req.body, event);
      const activity = await svc.createActivity(data, event);
      return cr.ok(activity);
    } catch (err) {
      return handleException(err, cr, "SuggestionController.POST /activity", "Failed to create activity suggestion");
    }
  });

  // DELETE /api/suggestion/activity/:id (admin)
  router.delete("/activity/:id", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Params") : undefined;
    try {
      const { id } = SuggestionValidator.validateIdParam(req.params, event);
      await svc.deleteActivity(id, event);
      return cr.ok({ deleted: true });
    } catch (err) {
      return handleException(err, cr, "SuggestionController.DELETE /activity/:id", "Failed to delete activity suggestion");
    }
  });

  // GET /api/suggestion/packing
  router.get("/packing", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "SERVICE", "packing") : undefined;
    try {
      const items = await svc.getAllPacking(event);
      return cr.ok(items);
    } catch (err) {
      return handleException(err, cr, "SuggestionController.GET /packing", "Failed to fetch packing suggestions");
    }
  });

  // POST /api/suggestion/packing (admin)
  router.post("/packing", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Body") : undefined;
    try {
      const data = SuggestionValidator.validateCreatePacking(req.body, event);
      const item = await svc.createPacking(data, event);
      return cr.ok(item);
    } catch (err) {
      return handleException(err, cr, "SuggestionController.POST /packing", "Failed to create packing suggestion");
    }
  });

  // DELETE /api/suggestion/packing/:id (admin)
  router.delete("/packing/:id", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Params") : undefined;
    try {
      const { id } = SuggestionValidator.validateIdParam(req.params, event);
      await svc.deletePacking(id, event);
      return cr.ok({ deleted: true });
    } catch (err) {
      return handleException(err, cr, "SuggestionController.DELETE /packing/:id", "Failed to delete packing suggestion");
    }
  });

  return router;
}
