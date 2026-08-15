import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { handleException, getUser } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IotApiKeyService } from "./IotApiKey.service.js";

export default function createIotApiKeyController(db: KnexSqlUtilities) {
  const router = Router();
  const service = new IotApiKeyService(db);

  router.get("/api-key", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const user = getUser(req);
      const logEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "SERVICE", "Get IoT API key status")
        : undefined;
      const result = await service.getKeyStatus(user.id, logEvent);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "IotApiKeyController.GET /api-key", "Failed to get API key status");
    }
  });

  router.post("/api-key", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const user = getUser(req);
      const { deviceName } = req.body;
      if (!deviceName) throw new Exceptions.InvalidRequest("deviceName");
      const result = await service.generateKey(user.id, deviceName, logContext);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "IotApiKeyController.POST /api-key", "Failed to generate API key");
    }
  });

  router.delete("/api-key", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const user = getUser(req);
      const result = await service.revokeKey(user.id, logContext);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "IotApiKeyController.DELETE /api-key", "Failed to revoke API key");
    }
  });

  return router;
}
