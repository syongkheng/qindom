import { Request, Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { BudgetService } from "./Budget.service.js";
import {
  validateCollaboratorBody,
  validateItemBody,
  validateItemUpdateBody,
  validateRenameBody,
  validateTableBody,
  validateUserIdParam,
} from "./Budget.validator.js";
import {
  BudgetCollaboratorDto,
  BudgetCollaboratorRemovedDto,
  BudgetDeletedDto,
  BudgetItemDto,
  BudgetRenamedDto,
  BudgetTableCreatedDto,
  BudgetTableDto,
  BudgetTableListDto,
} from "./Budget.types.js";

const validationEvent = (req: Request) => LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");

/** Shared budget tables (mounted under `mw.auth`). Owner/collaborator rules live in `BudgetService`. */
export default function createBudgetController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new BudgetService(db);

  router.get(
    "/",
    route("BudgetController.GET /", "Failed to load budget tables", async (req, cr) =>
      cr.ok<BudgetTableListDto>(await svc.listTables(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/",
    route("BudgetController.POST /", "Failed to create budget table", async (req, cr) => {
      const { name, template } = validateTableBody(req.body, validationEvent(req));
      return cr.ok<BudgetTableCreatedDto>(await svc.createTable(getUser(req).id, name, template, req.logContext));
    }),
  );

  router.get(
    "/:sessionId",
    route("BudgetController.GET /:sessionId", "Failed to load budget table", async (req, cr) =>
      cr.ok<BudgetTableDto>(await svc.getBySessionId(getUser(req).id, req.params.sessionId, req.logContext)),
    ),
  );

  router.post(
    "/:sessionId/update",
    route("BudgetController.POST /:sessionId/update", "Failed to rename budget table", async (req, cr) => {
      const { name } = validateRenameBody(req.body, validationEvent(req));
      return cr.ok<BudgetRenamedDto>(
        await svc.renameTable(getUser(req).id, req.params.sessionId, name, req.logContext),
      );
    }),
  );

  router.post(
    "/:sessionId/delete",
    route("BudgetController.POST /:sessionId/delete", "Failed to delete budget table", async (req, cr) =>
      cr.ok<BudgetDeletedDto>(await svc.deleteTable(getUser(req).id, req.params.sessionId, req.logContext)),
    ),
  );

  router.post(
    "/:sessionId/item",
    route("BudgetController.POST /:sessionId/item", "Failed to create budget item", async (req, cr) => {
      const body = validateItemBody(req.body, validationEvent(req));
      return cr.ok<BudgetItemDto>(await svc.createItem(getUser(req).id, req.params.sessionId, body, req.logContext));
    }),
  );

  router.post(
    "/:sessionId/item/:itemId/update",
    route("BudgetController.POST /:sessionId/item/:itemId/update", "Failed to update budget item", async (req, cr) => {
      const body = validateItemUpdateBody(req.body, validationEvent(req));
      const { sessionId, itemId } = req.params;
      return cr.ok<BudgetItemDto>(await svc.editItem(getUser(req).id, sessionId, itemId, body, req.logContext));
    }),
  );

  router.post(
    "/:sessionId/item/:itemId/delete",
    route("BudgetController.POST /:sessionId/item/:itemId/delete", "Failed to delete budget item", async (req, cr) => {
      const { sessionId, itemId } = req.params;
      return cr.ok<BudgetDeletedDto>(await svc.deleteItem(getUser(req).id, sessionId, itemId, req.logContext));
    }),
  );

  router.post(
    "/:sessionId/item/:itemId/restore",
    route(
      "BudgetController.POST /:sessionId/item/:itemId/restore",
      "Failed to restore budget item",
      async (req, cr) => {
        const { sessionId, itemId } = req.params;
        return cr.ok<BudgetItemDto>(await svc.restoreItem(getUser(req).id, sessionId, itemId, req.logContext));
      },
    ),
  );

  router.post(
    "/:sessionId/collaborator",
    route("BudgetController.POST /:sessionId/collaborator", "Failed to add collaborator", async (req, cr) => {
      const { email } = validateCollaboratorBody(req.body, validationEvent(req));
      return cr.ok<BudgetCollaboratorDto>(
        await svc.addCollaborator(getUser(req).id, req.params.sessionId, email, req.logContext),
      );
    }),
  );

  router.post(
    "/:sessionId/collaborator/:userId/delete",
    route(
      "BudgetController.POST /:sessionId/collaborator/:userId/delete",
      "Failed to remove collaborator",
      async (req, cr) => {
        const { userId } = validateUserIdParam(req.params);
        return cr.ok<BudgetCollaboratorRemovedDto>(
          await svc.removeCollaborator(getUser(req).id, req.params.sessionId, userId, req.logContext),
        );
      },
    ),
  );

  return router;
}
