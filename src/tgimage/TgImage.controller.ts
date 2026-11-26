import { Router } from "express";
import multer from "multer";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { clientIp, getUser, requireRole, route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Roles } from "../auth/Permission.js";
import { TgImageService } from "./TgImage.service.js";
import { validateAdminBody, validateUploadBody, validateUploadFile } from "./TgImage.validator.js";
import { TgAdminAddedDto, TgAdminDto, TgAdminRemovedDto, TgImageUploadDto } from "./TgImage.types.js";

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const UPLOAD_FIELD = "file";
/** A short code always serves the same image (a new upload gets a new code), so clients may cache it for a day. */
const IMAGE_CACHE_CONTROL = "public, max-age=86400";
// User content on the API origin: if anything ever renders as a document,
// it gets no script, no requests and a unique origin.
const IMAGE_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

/** Public `GET /img/:shortCode` (mounted under `mw.pub`). */
export function createTgImageGetController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TgImageService(db);

  // Writes binary with its own headers, so it uses `res` instead of `cr.ok`. The image is loaded
  // and re-encoded before the first header, so any failure still gets the standard JSON error.
  router.get(
    "/:shortCode",
    route("TgImageController.GET /:shortCode", "Failed to stream image", async (req, _cr, res) => {
      const { body, contentType } = await svc.loadImage(String(req.params.shortCode), req.logContext);
      res.setHeader("Cache-Control", IMAGE_CACHE_CONTROL);
      res.setHeader("Content-Security-Policy", IMAGE_CONTENT_SECURITY_POLICY);
      res.setHeader("Content-Type", contentType);
      res.end(body);
    }),
  );

  return router;
}

/** JWT routes (auth on the mount): upload, plus the SYSTEM_R5-only bot-admin whitelist. */
export function createTgImageController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TgImageService(db);

  router.post(
    "/upload",
    upload.single(UPLOAD_FIELD),
    route<RequestWithUserInfo>("TgImageController.POST /upload", "Upload failed", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Upload form");
      const file = validateUploadFile(req.file, event);
      const body = validateUploadBody(req.body, event);
      const uploader = {
        username: getUser(req).username,
        ip: clientIp(req),
      };
      return cr.ok<TgImageUploadDto>(await svc.upload(file, body, uploader, req.logContext));
    }),
  );

  router.get(
    "/admin/list",
    route<RequestWithUserInfo>("TgImageController.GET /admin/list", "Failed to list admins", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      return cr.ok<TgAdminDto[]>(await svc.listAdmins(req.logContext));
    }),
  );

  router.post(
    "/admin/add",
    route<RequestWithUserInfo>("TgImageController.POST /admin/add", "Failed to add admin", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { telegramUserId } = validateAdminBody(req.body, event);
      await svc.addToWhitelist(telegramUserId, req.logContext);
      return cr.ok<TgAdminAddedDto>({ added: true });
    }),
  );

  router.post(
    "/admin/remove",
    route<RequestWithUserInfo>("TgImageController.POST /admin/remove", "Failed to remove admin", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { telegramUserId } = validateAdminBody(req.body, event);
      return cr.ok<TgAdminRemovedDto>({ removed: await svc.removeFromWhitelist(telegramUserId, req.logContext) });
    }),
  );

  return router;
}
