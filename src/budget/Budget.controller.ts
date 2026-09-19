import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { BudgetService } from "./Budget.service.js";
import { BudgetValidator } from "./Budget.validator.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";

export default function createBudgetController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new BudgetService(db);

  function validationEvent(req: RequestWithUserInfo) {
    const logContext: IRequestLogContext = req.logContext;
    return logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body") : undefined;
  }

  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const result = await svc.listTables(getUser(req).id);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "BudgetController.GET /", "Failed to load budget tables");
    }
  });

  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { name, template } = BudgetValidator.validateCreateTableRequest(req.body, validationEvent(req));
      const result = await svc.createTable(getUser(req).id, name, template);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /", "Failed to create budget table");
    }
  });

  router.get("/:sessionId", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const result = await svc.getBySessionId(getUser(req).id, req.params.sessionId);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "BudgetController.GET /:sessionId", "Failed to load budget table");
    }
  });

  router.post("/edit/:sessionId", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { name } = BudgetValidator.validateRenameTableRequest(req.body, validationEvent(req));
      await svc.renameTable(getUser(req).id, req.params.sessionId, name);
      return cr.ok({ renamed: true });
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /edit/:sessionId", "Failed to rename budget table");
    }
  });

  router.post("/delete/:sessionId", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      await svc.deleteTable(getUser(req).id, req.params.sessionId);
      return cr.ok({ deleted: true });
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /delete/:sessionId", "Failed to delete budget table");
    }
  });

  router.post("/:sessionId/item", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const body = BudgetValidator.validateCreateItemRequest(req.body, validationEvent(req));
      const result = await svc.createItem(getUser(req).id, req.params.sessionId, body);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /:sessionId/item", "Failed to create budget item");
    }
  });

  router.post("/:sessionId/item/:itemId", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const body = BudgetValidator.validateEditItemRequest(req.body, validationEvent(req));
      const result = await svc.editItem(getUser(req).id, req.params.sessionId, req.params.itemId, body);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /:sessionId/item/:itemId", "Failed to update budget item");
    }
  });

  router.post("/:sessionId/item/:itemId/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      await svc.deleteItem(getUser(req).id, req.params.sessionId, req.params.itemId);
      return cr.ok({ deleted: true });
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /:sessionId/item/:itemId/delete", "Failed to delete budget item");
    }
  });

  router.post("/:sessionId/item/:itemId/restore", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const result = await svc.restoreItem(getUser(req).id, req.params.sessionId, req.params.itemId);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /:sessionId/item/:itemId/restore", "Failed to restore budget item");
    }
  });

  router.post("/:sessionId/collaborator", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { email } = BudgetValidator.validateAddCollaboratorRequest(req.body, validationEvent(req));
      const result = await svc.addCollaborator(getUser(req).id, req.params.sessionId, email);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /:sessionId/collaborator", "Failed to add collaborator");
    }
  });

  router.post("/:sessionId/collaborator/:userId/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      await svc.removeCollaborator(getUser(req).id, req.params.sessionId, Number(req.params.userId));
      return cr.ok({ removed: true });
    } catch (err) {
      return handleException(err, cr, "BudgetController.POST /:sessionId/collaborator/:userId/delete", "Failed to remove collaborator");
    }
  });

  return router;
}
