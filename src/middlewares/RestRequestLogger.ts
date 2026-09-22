import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import db from "../config/db/mysql.js";
import { TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";
import { resolveModuleKey } from "../utils/logging/TelegramLogModules.js";

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

// Resolves which subscribed chats (see tb_tg_stats_whitelist via
// TelegramLogSubscriptionService.listSubscribedChats) should receive this
// request's Telegram alert. Errors and unmapped routes always broadcast to
// every subscribed chat — a chat's per-module toggle only ever suppresses its
// own view of routine/successful traffic, mirroring the hardcoded silent-route
// override above (best-effort: never blocks flushing on a lookup failure).
async function resolveTelegramTargets(req: Request, statusCode: number): Promise<number[]> {
  if (isTelegramSilentRoute(req, statusCode)) return [];

  try {
    const allChatIds = await telegramLogSubscriptionService.listSubscribedChatIdsCached();
    if (!allChatIds.length) return [];

    const isError = statusCode >= 400;
    const moduleKey = resolveModuleKey(req.originalUrl.split("?")[0]);
    if (isError || !moduleKey) return allChatIds;

    const enabled: number[] = [];
    for (const chatId of allChatIds) {
      if (await telegramLogSubscriptionService.isEnabled(chatId, moduleKey)) enabled.push(chatId);
    }
    return enabled;
  } catch {
    return [];
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

    const telegramChatIds = await resolveTelegramTargets(req, res.statusCode);

    LoggingUtilities.request.flush(req.logContext, { telegramChatIds });
  });

  next();
};
