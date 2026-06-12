import { NextFunction, Request, Response } from "express";
import { IRequestLogContext } from "../models/IRequestLogContext";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { HeaderValidationUtilities } from "../utils/HeaderValidationUtilities";

export const RequestHeaderFilter = function (req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers["content-type"];
  const logContext: IRequestLogContext = req.logContext;

  // Header Validation

  const requestHeaderValidationLoggingEvent = logContext
    ? LoggingUtilities.request.branch(logContext, "VALIDATION", "General headers")
    : undefined;

  const userAgent = HeaderValidationUtilities.required(req.headers, "user-agent", requestHeaderValidationLoggingEvent);
  const rawIp =
    HeaderValidationUtilities.optional(req.headers, "x-real-ip", requestHeaderValidationLoggingEvent) ||
    HeaderValidationUtilities.optional(req.headers, "x-forwarded-for", requestHeaderValidationLoggingEvent) ||
    req.socket.remoteAddress ||
    "Unknown";
  const ipAddress = Array.isArray(rawIp) ? rawIp[0] : rawIp;

  logContext.metadata = {
    userAgent,
    ipAddress,
  };

  // Only enforce for requests that usually have a body
  if (["POST"].includes(req.method)) {
    if (!contentType || !contentType.includes("application/json")) {
      return res.status(415).json({
        message: "Unsupported Media Type. Only application/json is allowed.",
      });
    }
  }

  next();
};
