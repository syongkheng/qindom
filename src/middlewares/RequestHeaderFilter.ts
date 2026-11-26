import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";

const USER_AGENT_HEADER = "user-agent";
const JSON_CONTENT_TYPE = "application/json";
/** Methods that carry a body and so must send JSON (bodyless POSTs send `{}`). */
const BODY_METHODS = new Set(["POST"]);

/**
 * Part of `mw.std` / `mw.auth` / `mw.ssKey`. Requires a `User-Agent` (400 `invalid_request_user-agent`)
 * and `Content-Type: application/json` on POST (415 `unsupported_media_type`). Errors are thrown and
 * answered by `ErrorHandler`. The tree only gets an event when a check fails (passing checks were noise).
 */
export const RequestHeaderFilter = function (req: Request, _res: Response, next: NextFunction) {
  const failureEvent = () => LoggingUtilities.request.middleware(req.logContext, "VALIDATION", "General headers");

  if (!req.headers[USER_AGENT_HEADER]) {
    failureEvent().children.push(`(M) '${USER_AGENT_HEADER}' ${LogEmoji.error} `);
    throw new Exceptions.InvalidRequest(USER_AGENT_HEADER, "mandatory");
  }

  const contentType = req.headers["content-type"];
  if (BODY_METHODS.has(req.method) && !contentType?.includes(JSON_CONTENT_TYPE)) {
    failureEvent().children.push(
      `(M) 'content-type' must be ${JSON_CONTENT_TYPE}, got '${contentType ?? "none"}' ${LogEmoji.error}`,
    );
    throw new Exceptions.UnsupportedMediaType();
  }

  next();
};
