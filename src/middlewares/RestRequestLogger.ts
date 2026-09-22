import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import db from "../config/db/mysql.js";
import { TgImageService } from "../tgimage/TgImage.service.js";
import { TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";
import { resolveModuleKey } from "../utils/logging/TelegramLogModules.js";

const tgImageService = new TgImageService(db);
const telegramLogSubscriptionService = new TelegramLogSubscriptionService(db);

// Routes that fire frequently and add noise to Telegram — still logged to console/DB,
// just not pushed to the Telegram log chat. Errors from these routes still alert.
const TELEGRAM_SILENT_ROUTES: { method: string; path: string }[] = [
  { method: "POST", path: "/iot" },
  { method: "POST", path: "/api/analytics/heartbeat" },
];

function isTelegramSilentRoute(req: Request, statusCode: number): boolean {
  if (statusCode >= 400) return false;
  const path = req.originalUrl.split("?")[0];
  return TELEGRAM_SILENT_ROUTES.some((r) => r.method === req.method && r.path === path);
}

// getStorageChatId() is a DB query — cached alongside the subscription cache
// (TelegramLogSubscriptionService) so it isn't re-queried on every request.
const CHAT_ID_CACHE_TTL_MS = 30_000;
let cachedChatId: { value: number | null; expiresAt: number } | null = null;

async function getCachedStorageChatId(): Promise<number | null> {
  if (cachedChatId && cachedChatId.expiresAt > Date.now()) return cachedChatId.value;
  const value = await tgImageService.getStorageChatId();
  cachedChatId = { value, expiresAt: Date.now() + CHAT_ID_CACHE_TTL_MS };
  return value;
}

// Module-disabled check only ever suppresses non-error traffic — same
// "errors always alert" override the hardcoded silent-route list already has.
async function isModuleDisabled(req: Request, statusCode: number): Promise<boolean> {
  if (statusCode >= 400) return false;
  const moduleKey = resolveModuleKey(req.originalUrl.split("?")[0]);
  if (!moduleKey) return false;
  try {
    const chatId = await getCachedStorageChatId();
    if (!chatId) return false;
    return !(await telegramLogSubscriptionService.isEnabled(chatId, moduleKey));
  } catch {
    // best-effort — never block flushing on a subscription-lookup failure
    return false;
  }
}

export const RestRequestLogger = function (req: Request, res: Response, next: NextFunction) {
  const payload = req.method === "GET" ? req.query : JSON.parse(LoggingUtilities.sanitise(JSON.stringify(req.body ?? {})));

  const ipAddress = String(req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown");

  // ======================================================
  // CREATE REQUEST TREE CONTEXT
  // ======================================================

  req.logContext = {
    requestId: "req_" + crypto.randomUUID().replace(/-/g, "").substring(0, 5),
    startTime: Date.now(),
    method: req.method,
    path: req.originalUrl,
    ip: ipAddress,
    payload,
    events: [],
  };

  // ======================================================
  // FLUSH TREE AFTER REQUEST ENDS
  // ======================================================

  res.on("finish", async () => {
    req.logContext.statusCode = res.statusCode;

    const skipTelegram =
      isTelegramSilentRoute(req, res.statusCode) || (await isModuleDisabled(req, res.statusCode));

    LoggingUtilities.request.flush(req.logContext, { skipTelegram });
  });

  next();
};
