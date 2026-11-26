import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getApiKeyUserId, route } from "../utils/RequestUtilities.js";
import { TodoService } from "../todo/Todo.service.js";
import { TodoWidgetDto } from "../todo/Todo.types.js";

/** Read-only feed for the Scriptable lock-screen widget (`fndom/scriptable/todo-widget.js`), `ss_` API key. */
export default function createSsTodoControllerV1(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TodoService(db);

  router.get(
    "/todo",
    route("SsTodoControllerV1.GET /todo", "Failed to load tasks", async (req, cr) =>
      cr.ok<TodoWidgetDto>(await svc.widget(getApiKeyUserId(req), req.logContext)),
    ),
  );

  return router;
}
