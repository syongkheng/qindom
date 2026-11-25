import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import { requireRole, route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Roles } from "../auth/Permission.js";
import { SuggestionService } from "./Suggestion.service.js";
import {
  validateCountryQuery,
  validateIdParam,
  validateNoteBody,
  validatePackingBody,
} from "./Suggestion.validator.js";
import { NoteSuggestionDto, PackingSuggestionDto, SuggestionDeletedDto } from "./Suggestion.types.js";

/** Who may curate suggestions. */
const ADMIN_ROLES = [Roles.LEGACY_ADMIN, Roles.OWNER];

/**
 * Mounted under `mw.std` (public): the GETs are open; writes add MandatoryTokenFilter
 * per route + an admin role check (called by hand, not from fndom).
 */
export default function createSuggestionController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new SuggestionService(db);

  // ── Packing ──

  router.get(
    "/packing",
    route("SuggestionController.GET /packing", "Failed to fetch packing suggestions", async (req, cr) =>
      cr.ok<PackingSuggestionDto[]>(await svc.getAllPacking(req.logContext)),
    ),
  );

  router.post(
    "/packing",
    MandatoryTokenFilter,
    route("SuggestionController.POST /packing", "Failed to create packing suggestion", async (req, cr) => {
      requireRole(req, ...ADMIN_ROLES);
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validatePackingBody(req.body, event);
      return cr.ok<PackingSuggestionDto>(await svc.createPacking(body, req.logContext));
    }),
  );

  router.post(
    "/packing/:id/delete",
    MandatoryTokenFilter,
    route("SuggestionController.POST /packing/:id/delete", "Failed to delete packing suggestion", async (req, cr) => {
      requireRole(req, ...ADMIN_ROLES);
      const { id } = validateIdParam(req.params);
      return cr.ok<SuggestionDeletedDto>(await svc.deletePacking(id, req.logContext));
    }),
  );

  // ── Notes (per country) ──

  router.get(
    "/note",
    route("SuggestionController.GET /note", "Failed to fetch note suggestions", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Query");
      const { country } = validateCountryQuery(req.query, event);
      return cr.ok<NoteSuggestionDto[]>(await svc.getNotesByCountry(country, req.logContext));
    }),
  );

  router.post(
    "/note",
    MandatoryTokenFilter,
    route("SuggestionController.POST /note", "Failed to create note suggestion", async (req, cr) => {
      requireRole(req, ...ADMIN_ROLES);
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateNoteBody(req.body, event);
      return cr.ok<NoteSuggestionDto>(await svc.createNote(body, req.logContext));
    }),
  );

  router.post(
    "/note/:id/delete",
    MandatoryTokenFilter,
    route("SuggestionController.POST /note/:id/delete", "Failed to delete note suggestion", async (req, cr) => {
      requireRole(req, ...ADMIN_ROLES);
      const { id } = validateIdParam(req.params);
      return cr.ok<SuggestionDeletedDto>(await svc.deleteNote(id, req.logContext));
    }),
  );

  return router;
}
