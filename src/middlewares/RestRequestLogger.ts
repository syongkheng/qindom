import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import db from "../config/db/mysql.js";
import { TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";
import { resolveModuleKey } from "../utils/logging/TelegramLogModules.js";
import { clientIp } from "../utils/requestUtils.js";
import { toMessage } from "../utils/errorUtils.js";

const LOG_TAG = "RestRequestLogger";
const REQUEST_ID_PREFIX = "req_";
/** 12 hex chars (48 bits): the old 5-char ids collided within days of traffic. */
const REQUEST_ID_BYTES = 6;
/** 4xx and 5xx always alert every subscribed chat; muting only ever hides successes. */
const MIN_ERROR_STATUS = 400;

const telegramLogSubscriptionService = new TelegramLogSubscriptionService(db);

// Routes that fire frequently and add noise to Telegram: still logged to console/file,
// just not pushed to the Telegram log chat. Errors from these routes still alert.
const TELEGRAM_SILENT_ROUTES: { method: string; path: string }[] = [
  { method: "POST", path: "/analytics/heartbeat" },
  { method: "POST", path: "/analytics/collect" }, // every page view on every tracked site
  { method: "POST", path: "/camera/device/register" }, // every phone app launch
];

const pathWithoutQuery = (req: Request) => req.originalUrl.split("?")[0];

function isTelegramSilentRoute(req: Request, statusCode: number): boolean {
  if (statusCode >= MIN_ERROR_STATUS) return false;
  const path = pathWithoutQuery(req);
  return TELEGRAM_SILENT_ROUTES.some((r) => r.method === req.method && r.path === path);
}

/**
 * Which subscribed chats (every active `tb_tg_stats_whitelist` chat, see
 * `TelegramLogSubscriptionService`) get this request's Telegram alert. Errors and unmapped
 * routes go to every chat; a chat's per-module toggle only hides that module's successes.
 * Best-effort: a lookup failure sends no alert and never blocks the flush.
 */
async function resolveTelegramTargets(req: Request, statusCode: number): Promise<number[]> {
  if (isTelegramSilentRoute(req, statusCode)) return [];

  try {
    const allChatIds = await telegramLogSubscriptionService.listSubscribedChatIdsCached();
    if (!allChatIds.length) return [];

    const moduleKey = resolveModuleKey(pathWithoutQuery(req));
    if (statusCode >= MIN_ERROR_STATUS || !moduleKey) return allChatIds;

    const enabled: number[] = [];
    for (const chatId of allChatIds) {
      if (await telegramLogSubscriptionService.isEnabled(chatId, moduleKey)) enabled.push(chatId);
    }
    return enabled;
  } catch {
    return [];
  }
}

/** Writes the request tree (console + request-log file) and fans out the Telegram alerts. */
async function flushRequestLog(req: Request, res: Response): Promise<void> {
  req.logContext.statusCode = res.statusCode;
  const telegramChatIds = await resolveTelegramTargets(req, res.statusCode);
  LoggingUtilities.request.flush(req.logContext, { telegramChatIds });
}

/** First middleware of every route preset: opens the request tree (`req.logContext`), flushed when the response finishes. */
export const RestRequestLogger = function (req: Request, res: Response, next: NextFunction) {
  // `?? {}`: bodyless requests (no parser ran) have no req.body, which must not crash the logger.
  const payload = LoggingUtilities.redact(req.method === "GET" ? req.query : (req.body ?? {}));

  req.logContext = {
    requestId: REQUEST_ID_PREFIX + crypto.randomBytes(REQUEST_ID_BYTES).toString("hex"),
    startTime: Date.now(),
    currentStage: "middleware",
    method: req.method,
    httpVersion: req.httpVersion,
    path: LoggingUtilities.redactUrl(req.originalUrl),
    ip: clientIp(req),
    payload,
    events: [],
  };

  // Runs after the response is sent and nobody awaits it: a failure here must be logged, never
  // become an unhandled rejection (which would take the whole API down).
  res.on("finish", () => {
    flushRequestLog(req, res).catch((err) =>
      LoggingUtilities.service.error(LOG_TAG, `Failed to flush ${req.logContext.requestId}: ${toMessage(err)}`),
    );
  });

  next();
};
