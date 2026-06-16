import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

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

    LoggingUtilities.request.flush(req.logContext);
  });

  next();
};
