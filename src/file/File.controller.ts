import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { FileService } from "./File.service";
import { FileValidator } from "./File.validator";
import { getUser, handleException } from "../utils/requestUtils";
import { Exceptions } from "../exceptions/AppExceptions";

export default function createFileController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new FileService(db);

  router.post("/tg", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { uuid, agendaId, tgShortCode, mimeType, name, sizeInBytes } = req.body;
      if (!uuid || !agendaId || !tgShortCode || !mimeType) throw new Exceptions.InvalidRequest("uuid|agendaId|tgShortCode|mimeType");
      const result = await svc.uploadTg(getUser(req).username, uuid, Number(agendaId), tgShortCode, mimeType, name, sizeInBytes);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "FileController.POST /tg", "Failed to link tg image");
    }
  });

  router.post("/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
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
