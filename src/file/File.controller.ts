import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { FileService } from "./File.service.js";
import { validateDeleteBody } from "./File.validator.js";
import { FileDeletedDto } from "./File.types.js";

export default function createFileController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new FileService(db);

  router.post(
    "/delete",
    route("FileController.POST /delete", "Failed to delete files", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { _fileIdsToDelete } = validateDeleteBody(req.body, event);
      return cr.ok<FileDeletedDto>(await svc.deleteByUuids(getUser(req).id, _fileIdsToDelete, req.logContext));
    }),
  );

  return router;
}
