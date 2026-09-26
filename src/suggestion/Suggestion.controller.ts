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

  // GET /suggestion/packing
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

  // POST /suggestion/packing (admin)
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

  // DELETE /suggestion/packing/:id (admin)
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

  // GET /suggestion/note?country=Singapore
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

  // POST /suggestion/note (admin)
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

  // DELETE /suggestion/note/:id (admin)
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

  return router;
}
