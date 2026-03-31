import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { FileService } from "./File.service";
import { FileValidator } from "./File.validator";
import { getUser, handleException } from "../utils/requestUtils";

export default function createFileController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new FileService(db);

  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { uuid, agendaId, blob, mimeType, name, sizeInBytes } = FileValidator.validateUploadRequest(req);
      const result = await svc.upload(getUser(req).username, uuid, agendaId, blob, mimeType, name, sizeInBytes);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "FileController.POST /", "Failed to upload file");
    }
  });

  router.post("/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { fileIds } = FileValidator.validateDeleteRequest(req);
      const deleted = await svc.deleteByUuids(getUser(req).username, fileIds);
      return cr.ok({ deleted });
    } catch (err) {
      return handleException(err, cr, "FileController.POST /delete", "Failed to delete files");
    }
  });

  return router;
}
