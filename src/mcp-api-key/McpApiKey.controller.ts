import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { handleException, getUser } from "../utils/requestUtils.js";
import { McpApiKeyService } from "./McpApiKey.service.js";

export default function createMcpApiKeyController(db: KnexSqlUtilities) {
  const router = Router();
  const service = new McpApiKeyService(db);

  router.get("/api-key", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.getKeyStatus(getUser(req).id));
    } catch (err) {
      return handleException(err, cr, "McpApiKeyController.GET /api-key", "Failed to get API key status");
    }
  });

  router.post("/api-key", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.generateKey(getUser(req).id));
    } catch (err) {
      return handleException(err, cr, "McpApiKeyController.POST /api-key", "Failed to generate API key");
    }
  });

  router.delete("/api-key", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.revokeKey(getUser(req).id));
    } catch (err) {
      return handleException(err, cr, "McpApiKeyController.DELETE /api-key", "Failed to revoke API key");
    }
  });

  return router;
}
