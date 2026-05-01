import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { FileService } from "./File.service";
import { FileValidator } from "./File.validator";
import { getUser, handleException } from "../utils/requestUtils";
import { Exceptions } from "../exceptions/AppExceptions";

export function createFileGetController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new FileService(db);

  router.get("/img/:shortCode", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { shortCode } = req.params;
      if (!shortCode) throw new Exceptions.InvalidRequest("shortCode");
      const result = await svc.getBlobByShortCode(shortCode);
      if (!result) throw new Exceptions.NotFound();
      res.setHeader("Content-Type", result.mimeType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(result.buffer);
    } catch (err) {
      return handleException(err, cr, "FileController.GET /img/:shortCode", "Failed to retrieve file");
    }
  });

  router.get("/:uuid", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { uuid } = req.params;
      if (!uuid) throw new Exceptions.InvalidRequest("uuid");
      const result = await svc.getBlob(uuid);
      if (!result) throw new Exceptions.NotFound();
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "FileController.GET /:uuid", "Failed to retrieve file");
    }
  });

  return router;
}

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
