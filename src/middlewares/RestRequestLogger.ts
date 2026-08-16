import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

// Routes that fire frequently and add noise to Telegram — still logged to console/DB,
// just not pushed to the Telegram log chat. Errors from these routes still alert.
const TELEGRAM_SILENT_ROUTES: { method: string; path: string }[] = [{ method: "POST", path: "/iot" }];

function isTelegramSilentRoute(req: Request, statusCode: number): boolean {
  if (statusCode >= 400) return false;
  const path = req.originalUrl.split("?")[0];
  return TELEGRAM_SILENT_ROUTES.some((r) => r.method === req.method && r.path === path);
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

  res.on("finish", () => {
    req.logContext.statusCode = res.statusCode;

    LoggingUtilities.request.flush(req.logContext, { skipTelegram: isTelegramSilentRoute(req, res.statusCode) });
  });

  next();
};
