import sharp from "sharp";
import { Router, Request, Response } from "express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const heicConvert = require("heic-convert") as (opts: { buffer: Buffer; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer>;
import multer from "multer";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { TelegramService } from "./Telegram.service";
import { TelegramValidator } from "./Telegram.validator";
import { getUser, handleException } from "../utils/requestUtils";
import { getTelegramBot } from "./Telegram.bot";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export default function createTelegramController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TelegramService(db);

  // Check if the authenticated user's Telegram account is linked
  router.get("/link-status", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const result = await svc.getLinkStatus(getUser(req).username);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "TelegramController.GET /link-status", "Failed to get link status");
    }
  });

  // Generate a one-time link token for account linking
  router.post("/link-token", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const result = await svc.generateLinkToken(getUser(req).username);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "TelegramController.POST /link-token", "Failed to generate link token");
    }
  });

  // List all media uploaded by the authenticated user
  router.get("/media", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const media = await svc.listMedia(getUser(req).username);
      return cr.ok(media);
    } catch (err) {
      return handleException(err, cr, "TelegramController.GET /media", "Failed to list media");
    }
  });

  // Get metadata for a single media item
  router.get("/media/:id", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { id } = TelegramValidator.validateIdParam(req);
      const media = await svc.getMedia(id, getUser(req).username);
      return cr.ok(media);
    } catch (err) {
      return handleException(err, cr, "TelegramController.GET /media/:id", "Failed to get media");
    }
  });

  // Proxy-download a file — bot token and CDN URL never leave the server
  router.get("/media/:id/download", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { id } = TelegramValidator.validateIdParam(req);
      const { stream, contentType, filename, contentLength } = await svc.proxyDownload(id, getUser(req).username);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      stream.pipe(res);
    } catch (err) {
      return handleException(err, cr, "TelegramController.GET /media/:id/download", "Failed to download file");
    }
  });

  // Serve a JPEG preview — routes HEIC/HEIF through heic-convert, others through sharp
  router.get("/media/:id/preview", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { id } = TelegramValidator.validateIdParam(req);
      const { stream, contentType, filename } = await svc.proxyDownload(id, getUser(req).username);

      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const isHeic = contentType === "image/heic" || contentType === "image/heif" || ext === "heic" || ext === "heif";

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");

      if (isHeic) {
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", resolve);
          stream.on("error", reject);
        });
        const input = Buffer.concat(chunks);
        const output = await heicConvert({ buffer: input, format: "JPEG", quality: 0.7 });
        return res.send(Buffer.from(output));
      }

      stream.pipe(sharp().jpeg({ quality: 70 })).pipe(res);
    } catch (err) {
      return handleException(err, cr, "TelegramController.GET /media/:id/preview", "Failed to preview");
    }
  });

  // Soft-delete a media item
  router.post("/media/:id/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { id } = TelegramValidator.validateIdParam(req);
      await svc.deleteMedia(id, getUser(req).username);
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "TelegramController.POST /media/:id/delete", "Failed to delete media");
    }
  });

  // Set or update expiry (days=0 means never)
  router.post("/media/:id/expire", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { id } = TelegramValidator.validateIdParam(req);
      const { days } = TelegramValidator.validateSetExpiry(req);
      await svc.setExpiry(id, getUser(req).username, days);
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "TelegramController.POST /media/:id/expire", "Failed to set expiry");
    }
  });

  return router;
}

// Upload handler — mounted without RequestHeaderFilter (multipart/form-data)
export function createTelegramUploadController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TelegramService(db);

  router.post("/media/upload", upload.single("file"), async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      if (!req.file) throw new Error("No file attached");
      const result = await svc.uploadMedia({
        username:     getUser(req).username,
        fileBuffer:   req.file.buffer,
        originalname: req.file.originalname,
        mimetype:     req.file.mimetype,
        size:         req.file.size,
      });
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "TelegramController.POST /media/upload", "Failed to upload media");
    }
  });

  return router;
}

// Webhook handler — registered separately in index.ts (no MandatoryTokenFilter)
export function createTelegramWebhookHandler(db: KnexSqlUtilities) {
  return async (req: Request, res: Response): Promise<void> => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const incoming = req.headers["x-telegram-bot-api-secret-token"];
      if (incoming !== secret) {
        res.sendStatus(403);
        return;
      }
    }

    try {
      const bot = getTelegramBot();
      if (bot) {
        bot.processUpdate(req.body);
      }
    } catch (err) {
      LoggingUtilities.service.error("TelegramWebhook", String(err));
    }

    res.sendStatus(200);
  };
}
