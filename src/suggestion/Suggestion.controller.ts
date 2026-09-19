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

  // PUT /api/suggestion/activity/:id (admin)
  router.put("/activity/:id", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Body") : undefined;
    try {
      const { id } = SuggestionValidator.validateIdParam(req.params, event);
      const data = SuggestionValidator.validateUpdateActivity(req.body, event);
      await svc.updateActivity(id, data, event);
      return cr.ok({ updated: true });
    } catch (err) {
      return handleException(err, cr, "SuggestionController.PUT /activity/:id", "Failed to update activity suggestion");
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

  // GET /api/suggestion/activity/admin/list (admin) — full catalogue for the admin UI table
  router.get("/activity/admin/list", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    try {
      return cr.ok(await svc.getAllActivitiesAdmin());
    } catch (err) {
      return handleException(err, cr, "SuggestionController.GET /activity/admin/list", "Failed to list activity suggestions");
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

  // GET /api/suggestion/note?country=Singapore
  router.get("/note", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Query") : undefined;
    try {
      const { country } = SuggestionValidator.validateNoteSearch(req.query as Record<string, unknown>, event);
      const notes = await svc.getNotesByCountry(country, event);
      return cr.ok(notes);
    } catch (err) {
      return handleException(err, cr, "SuggestionController.GET /note", "Failed to fetch note suggestions");
    }
  });

  // POST /api/suggestion/note (admin)
  router.post("/note", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Body") : undefined;
    try {
      const data = SuggestionValidator.validateCreateNote(req.body, event);
      const note = await svc.createNote(data, event);
      return cr.ok(note);
    } catch (err) {
      return handleException(err, cr, "SuggestionController.POST /note", "Failed to create note suggestion");
    }
  });

  // DELETE /api/suggestion/note/:id (admin)
  router.delete("/note/:id", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Params") : undefined;
    try {
      const { id } = SuggestionValidator.validateIdParam(req.params, event);
      await svc.deleteNote(id, event);
      return cr.ok({ deleted: true });
    } catch (err) {
      return handleException(err, cr, "SuggestionController.DELETE /note/:id", "Failed to delete note suggestion");
    }
  });

  // GET /api/suggestion/place?destination=Singapore — curated only (public);
  // the live-merged view (curated + Overpass) is served by /api/places.
  router.get("/place", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Query") : undefined;
    try {
      const { destination } = SuggestionValidator.validateActivitySearch(req.query as Record<string, unknown>, event);
      const places = await svc.getPlacesByDestination(destination, event);
      return cr.ok(places);
    } catch (err) {
      return handleException(err, cr, "SuggestionController.GET /place", "Failed to fetch place suggestions");
    }
  });

  // POST /api/suggestion/place (admin)
  router.post("/place", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Body") : undefined;
    try {
      const data = SuggestionValidator.validateCreatePlace(req.body, event);
      const place = await svc.createPlace(data, event);
      return cr.ok(place);
    } catch (err) {
      return handleException(err, cr, "SuggestionController.POST /place", "Failed to create place suggestion");
    }
  });

  // PUT /api/suggestion/place/:id (admin)
  router.put("/place/:id", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Body") : undefined;
    try {
      const { id } = SuggestionValidator.validateIdParam(req.params, event);
      const data = SuggestionValidator.validateUpdatePlace(req.body, event);
      await svc.updatePlace(id, data, event);
      return cr.ok({ updated: true });
    } catch (err) {
      return handleException(err, cr, "SuggestionController.PUT /place/:id", "Failed to update place suggestion");
    }
  });

  // DELETE /api/suggestion/place/:id (admin)
  router.delete("/place/:id", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    const logContext = req.logContext;
    const event = logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Params") : undefined;
    try {
      const { id } = SuggestionValidator.validateIdParam(req.params, event);
      await svc.deletePlace(id, event);
      return cr.ok({ deleted: true });
    } catch (err) {
      return handleException(err, cr, "SuggestionController.DELETE /place/:id", "Failed to delete place suggestion");
    }
  });

  // GET /api/suggestion/place/admin/list (admin) — full catalogue for the admin UI table
  router.get("/place/admin/list", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    if (!hasRole(req, "admin")) return cr.result(403, "Forbidden", "Insufficient permissions");
    try {
      return cr.ok(await svc.getAllPlacesAdmin());
    } catch (err) {
      return handleException(err, cr, "SuggestionController.GET /place/admin/list", "Failed to list place suggestions");
    }
  });

  return router;
}
