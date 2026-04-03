import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { TelegramService } from "./Telegram.service";
import { TelegramValidator } from "./Telegram.validator";
import { getUser, handleException } from "../utils/requestUtils";
import { getTelegramBot } from "./Telegram.bot";
import { LoggingUtilities } from "../utils/LoggingUtilities";

export default function createTelegramController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new TelegramService(db);

  // Check if the authenticated user's Telegram account is linked
  router.get("/link-status", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const result = await svc.getLinkStatus(getUser(req).username);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "TelegramController.GET /link-status", "Failed to get link status");
    }
  });

  // Generate a one-time link token for account linking
  router.post("/link-token", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const result = await svc.generateLinkToken(getUser(req).username);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "TelegramController.POST /link-token", "Failed to generate link token");
    }
  });

  // List all media uploaded by the authenticated user
  router.get("/media", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const media = await svc.listMedia(getUser(req).username);
      return cr.ok(media);
    } catch (err) {
      return handleException(err, cr, "TelegramController.GET /media", "Failed to list media");
    }
  });

  // Get metadata for a single media item
  router.get("/media/:id", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
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
    const cr = new ControllerResponse(res);
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

  // Soft-delete a media item
  router.post("/media/:id/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
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
    const cr = new ControllerResponse(res);
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
