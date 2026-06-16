import { NextFunction, Request, Response } from "express";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { HeaderValidationUtilities } from "../utils/HeaderValidationUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";

export const RequestHeaderFilter = function (req: Request, res: Response, next: NextFunction) {
  const cr = new ControllerResponse(req, res);
  const contentType = req.headers["content-type"];
  const logContext: IRequestLogContext = req.logContext;

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
    ...logContext.metadata,
    userAgent,
    ipAddress,
  };

  // Only enforce for requests that usually have a body
  if (["POST"].includes(req.method)) {
    if (!contentType || !contentType.includes("application/json")) {
      return cr.result(415, "Unsupported Media Type", "Content-Type must be application/json");
    }
  }

  next();
};
