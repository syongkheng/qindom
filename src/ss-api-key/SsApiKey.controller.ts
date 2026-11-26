import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { SsApiKeyService } from "./SsApiKey.service.js";
import { validateRenameBody } from "./SsApiKey.validator.js";
import { SsApiKeyGeneratedDto, SsApiKeyRevokedDto, SsApiKeyStatusDto } from "./SsApiKey.types.js";

export default function createSsApiKeyController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new SsApiKeyService(db);

  router.get(
    "/api-key",
    route("SsApiKeyController.GET /api-key", "Failed to get API key status", async (req, cr) =>
      cr.ok<SsApiKeyStatusDto>(await svc.getKeyStatus(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/api-key",
    route("SsApiKeyController.POST /api-key", "Failed to generate API key", async (req, cr) =>
      cr.ok<SsApiKeyGeneratedDto>(await svc.generateKey(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/api-key/name",
    route("SsApiKeyController.POST /api-key/name", "Failed to rename API key", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { name } = validateRenameBody(req.body, event);
      return cr.ok<SsApiKeyStatusDto>(await svc.renameKey(getUser(req).id, name, req.logContext));
    }),
  );

  router.post(
    "/api-key/delete",
    route("SsApiKeyController.POST /api-key/delete", "Failed to revoke API key", async (req, cr) =>
      cr.ok<SsApiKeyRevokedDto>(await svc.revokeKey(getUser(req).id, req.logContext)),
    ),
  );

  return router;
}
