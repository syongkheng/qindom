import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { handleException } from "../utils/requestUtils.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { TodoService } from "../todo/Todo.service.js";

// Read-only feed for the Scriptable lock-screen widget, authenticated with the
// user's ss_ API key (x-api-key) like the other Shortcuts routes.
export default function createSsTodoControllerV1(db: KnexSqlUtilities) {
  const router = Router();
  const service = new TodoService(db);

  router.get("/todo", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const userId = logContext?.metadata?.userId as number;
      return cr.ok(await service.widget(userId));
    } catch (err) {
      return handleException(err, cr, "SsTodoControllerV1.GET /todo", "Failed to load tasks");
    }
  });

  return router;
}
