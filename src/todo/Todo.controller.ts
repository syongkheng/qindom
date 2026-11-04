import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { TodoService } from "./Todo.service.js";
import { TodoValidator } from "./Todo.validator.js";

// Authenticated web CRUD for the personal to-do list. The read-only lock-screen
// widget feed lives in siri-shortcut/Todo.v1.controller.ts (ss_ API key).
export default function createTodoController(db: KnexSqlUtilities) {
  const router = Router();
  const service = new TodoService(db);

  const validationEvent = (logContext?: IRequestLogContext) =>
    logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body") : undefined;

  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.list(getUser(req).id));
    } catch (err) {
      return handleException(err, cr, "TodoController.GET /", "Failed to load tasks");
    }
  });

  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { title } = TodoValidator.validateCreateRequest(req.body, validationEvent(req.logContext));
      return cr.ok(await service.create(getUser(req).id, title));
    } catch (err) {
      return handleException(err, cr, "TodoController.POST /", "Failed to add task");
    }
  });

  // Registered before /:taskId/* so "reorder" is never read as a task id.
  router.post("/reorder", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { ids } = TodoValidator.validateReorderRequest(req.body);
      return cr.ok(await service.reorder(getUser(req).id, ids));
    } catch (err) {
      return handleException(err, cr, "TodoController.POST /reorder", "Failed to reorder tasks");
    }
  });

  router.post("/:taskId/update", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const body = TodoValidator.validateUpdateRequest(req.body, validationEvent(req.logContext));
      return cr.ok(await service.update(getUser(req).id, req.params.taskId, body));
    } catch (err) {
      return handleException(err, cr, "TodoController.POST /:taskId/update", "Failed to update task");
    }
  });

  router.post("/:taskId/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.delete(getUser(req).id, req.params.taskId));
    } catch (err) {
      return handleException(err, cr, "TodoController.POST /:taskId/delete", "Failed to delete task");
    }
  });

  router.post("/:taskId/restore", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.restore(getUser(req).id, req.params.taskId));
    } catch (err) {
      return handleException(err, cr, "TodoController.POST /:taskId/restore", "Failed to restore task");
    }
  });

  return router;
}
