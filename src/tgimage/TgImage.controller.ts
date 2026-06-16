import { Router, Request, Response } from "express";
import multer from "multer";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { TgImageService } from "./TgImage.service.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { getUser, handleException } from "../utils/requestUtils.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export function createTgImageGetController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TgImageService(db);

  router.get("/:shortCode", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const record = await svc.getByShortCode(req.params.shortCode);
      if (!record) throw new Exceptions.NotFound();
      const { stream, contentType } = await svc.resolveStream(record.telegram_file_id, record.mime_type ?? "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Content-Type", contentType);
      stream.pipe(res);
    } catch (err) {
      return handleException(err, cr, "TgImageController.GET /:shortCode", "Failed to stream image");
    }
  });

  return router;
}

export function createTgImageController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TgImageService(db);

  router.post("/upload", upload.single("file"), async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      if (!req.file) return cr.badRequest("No file provided");
      const username = getUser(req).username;
      const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
      const sessionId = req.body?.sessionId as string | undefined;
      const uuid = req.body?.uuid as string | undefined;
      const result = await svc.upload(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        { username, ip, sessionId, uuid },
      );
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "TgImageController.POST /upload", "Upload failed");
    }
  });

  router.get("/admin/list", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await svc.listAdmins());
    } catch (err) {
      return handleException(err, cr, "TgImageController.GET /admin/list", "Failed to list admins");
    }
  });

  router.post("/admin/add", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const telegramUserId = Number(req.body?.telegramUserId);
      if (!telegramUserId || isNaN(telegramUserId)) return cr.badRequest("telegramUserId required");
      await svc.addToWhitelist(telegramUserId);
      return cr.ok({ added: true });
    } catch (err) {
      return handleException(err, cr, "TgImageController.POST /admin/add", "Failed to add admin");
    }
  });

  router.post("/admin/remove", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const telegramUserId = Number(req.body?.telegramUserId);
      if (!telegramUserId || isNaN(telegramUserId)) return cr.badRequest("telegramUserId required");
      const removed = await svc.removeFromWhitelist(telegramUserId);
      return cr.ok({ removed });
    } catch (err) {
      return handleException(err, cr, "TgImageController.POST /admin/remove", "Failed to remove admin");
    }
  });

  return router;
}
