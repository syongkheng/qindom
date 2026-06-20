import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { FileService } from "./File.service.js";
import { FileValidator } from "./File.validator.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";

export default function createFileController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new FileService(db);

  router.post("/tg", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { uuid, agendaId, tgShortCode, mimeType, name, sizeInBytes } = req.body;
      StructuralValidationUtilities.required(uuid, "uuid", validationEvent);
      StructuralValidationUtilities.required(agendaId, "agendaId", validationEvent);
      StructuralValidationUtilities.required(tgShortCode, "tgShortCode", validationEvent);
      StructuralValidationUtilities.required(mimeType, "mimeType", validationEvent);
      const result = await svc.uploadTg(getUser(req).id, uuid, Number(agendaId), tgShortCode, mimeType, name, sizeInBytes);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "FileController.POST /tg", "Failed to link tg image");
    }
  });

  router.post("/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { fileIds } = FileValidator.validateDeleteRequest(req.body, validationEvent);
      const deleted = await svc.deleteByUuids(getUser(req).id, fileIds);
      return cr.ok({ deleted });
    } catch (err) {
      return handleException(err, cr, "FileController.POST /delete", "Failed to delete files");
    }
  });

  return router;
}
