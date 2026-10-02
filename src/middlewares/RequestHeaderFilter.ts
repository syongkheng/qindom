import { NextFunction, Request, Response } from "express";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { HeaderValidationUtilities } from "../utils/HeaderValidationUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";

export const RequestHeaderFilter = function (req: Request, res: Response, next: NextFunction) {
  const cr = new ControllerResponse(req, res);
  const contentType = req.headers["content-type"];
  const logContext: IRequestLogContext = req.logContext;

  // Logged only when a check fails — passing checks (and the optional proxy
  // IP headers, which are always absent in dev) were pure noise on every request.
  const failureEvent = () =>
    logContext ? LoggingUtilities.request.middleware(logContext, "VALIDATION", "General headers") : undefined;

  const userAgent = HeaderValidationUtilities.required(
    req.headers,
    "user-agent",
    req.headers["user-agent"] ? undefined : failureEvent(),
  );
  const rawIp =
    HeaderValidationUtilities.optional(req.headers, "x-real-ip") ||
    HeaderValidationUtilities.optional(req.headers, "x-forwarded-for") ||
    req.socket.remoteAddress ||
    "Unknown";
  const ipAddress = Array.isArray(rawIp) ? rawIp[0] : rawIp;

  logContext.metadata = {
    ...logContext.metadata,
    userAgent,
    ipAddress,
  };

  // Only enforce for requests that usually have a body
  if (["POST"].includes(req.method)) {
    if (!contentType || !contentType.includes("application/json")) {
      failureEvent()?.children.push(`(M) 'content-type' must be application/json, got '${contentType ?? "none"}' ❌`);
      return cr.result(415, "Unsupported Media Type", "Content-Type must be application/json");
    }
  }

  next();
};
