import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { TodoService } from "./Todo.service.js";
import { validateCreateBody, validateReorderBody, validateUpdateBody } from "./Todo.validator.js";
import { TodoDeletedDto, TodoListDto, TodoTaskDto } from "./Todo.types.js";

/**
 * Authenticated web CRUD for the personal to-do list (mounted under `mw.auth`).
 * The read-only lock-screen widget feed is `siri-shortcut/Todo.v1.controller.ts` (ss_ API key).
 */
export default function createTodoController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TodoService(db);

  router.get(
    "/",
    route("TodoController.GET /", "Failed to load tasks", async (req, cr) =>
      cr.ok<TodoListDto>(await svc.list(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/",
    route("TodoController.POST /", "Failed to add task", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { title } = validateCreateBody(req.body, event);
      return cr.ok<TodoTaskDto>(await svc.create(getUser(req).id, title, req.logContext));
    }),
  );

  // Registered before /:taskId/* so "reorder" is never read as a task id.
  router.post(
    "/reorder",
    route("TodoController.POST /reorder", "Failed to reorder tasks", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { ids } = validateReorderBody(req.body, event);
      return cr.ok<TodoListDto>(await svc.reorder(getUser(req).id, ids, req.logContext));
    }),
  );

  router.post(
    "/:taskId/update",
    route("TodoController.POST /:taskId/update", "Failed to update task", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const update = validateUpdateBody(req.body, event);
      return cr.ok<TodoTaskDto>(await svc.update(getUser(req).id, req.params.taskId, update, req.logContext));
    }),
  );

  router.post(
    "/:taskId/delete",
    route("TodoController.POST /:taskId/delete", "Failed to delete task", async (req, cr) =>
      cr.ok<TodoDeletedDto>(await svc.delete(getUser(req).id, req.params.taskId, req.logContext)),
    ),
  );

  router.post(
    "/:taskId/restore",
    route("TodoController.POST /:taskId/restore", "Failed to restore task", async (req, cr) =>
      cr.ok<TodoTaskDto>(await svc.restore(getUser(req).id, req.params.taskId, req.logContext)),
    ),
  );

  return router;
}
