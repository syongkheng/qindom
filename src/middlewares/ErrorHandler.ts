import { STATUS_CODES } from "node:http";
import { BaseException } from "../exceptions/AppExceptions.js";
import { ErrorRequestHandler } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/errorUtils.js";

const GENERIC_500 = "An internal error occurred. Please try again later.";
const KO = "Ko";
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const MIN_CLIENT_ERROR = 400;
const MIN_SERVER_ERROR = 500;
const INTERNAL_ERROR = 500;
const MULTER_ERROR_NAME = "MulterError";
const MULTER_FILE_TOO_LARGE = "LIMIT_FILE_SIZE";
const JSON_PARSE_FAILED = "entity.parse.failed";
const LOG_TAG = "ErrorHandler";

// Client-safe status + message for an error that reached Express (thrown by a middleware,
// body-parser, multer or CORS), or null when it should be treated as an unexpected 500.
function toClientError(err: unknown): { status: number; message: unknown } | null {
  if (err instanceof BaseException) {
    return { status: err.httpStatus, message: err.toResponseMessage() };
  }
  // Matched by shape rather than instanceof multer.MulterError, which misses
  // when more than one copy of multer gets loaded.
  const m = err as { name?: unknown; code?: unknown; message?: unknown };
  if (m?.name === MULTER_ERROR_NAME && typeof m.code === "string") {
    return { status: m.code === MULTER_FILE_TOO_LARGE ? PAYLOAD_TOO_LARGE : BAD_REQUEST, message: String(m.message) };
  }
  // http-errors shape: body-parser (malformed JSON, payload too large) and the
  // CORS rejection in index.ts. `expose` marks the message as safe for clients.
  const e = err as { status?: unknown; expose?: unknown; type?: unknown; message?: unknown };
  if (typeof e?.status === "number" && e.status >= MIN_CLIENT_ERROR && e.status < MIN_SERVER_ERROR) {
    if (e.type === JSON_PARSE_FAILED) return { status: BAD_REQUEST, message: "Malformed JSON body" };
    return { status: e.status, message: e.expose ? String(e.message) : STATUS_CODES[e.status] };
  }
  return null;
}

/**
 * Last middleware in the chain. Without it Express 5's default finalhandler
 * answers with an HTML page containing err.stack whenever NODE_ENV isn't
 * "production" — and prod runs as "prd" — so every uncaught error leaked
 * absolute paths and library versions. Responds with the usual JSON envelope.
 *
 * Errors raised before RestRequestLogger (CORS, express.json) have no
 * req.logContext, which the request-log helpers require, so those are answered
 * directly instead of through ControllerResponse (the one deliberate `req.logContext` check).
 */
export const ErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Mid-stream failure (e.g. /img piping): too late for a body — let Express
  // close the connection.
  if (res.headersSent) return next(err);

  try {
    const clientError = toClientError(err);
    const status = clientError?.status ?? INTERNAL_ERROR;
    const statusText = STATUS_CODES[status] ?? KO;

    if (req.logContext) {
      const cr = new ControllerResponse(req, res);
      if (!clientError) return cr.ko(GENERIC_500, { source: LOG_TAG, error: err });
      // Any status by design: this handler answers for every error kind above.
      return cr.result(status, statusText, clientError.message);
    }

    if (!clientError) {
      LoggingUtilities.service.error(LOG_TAG, `${req.method} ${req.path} ${toMessage(err)}`);
    }
    return res.status(status).json({
      code: status,
      status: clientError ? statusText : KO,
      data: clientError ? clientError.message : GENERIC_500,
    });
  } catch (handlerError) {
    LoggingUtilities.service.error(LOG_TAG, `Failed to handle error: ${toMessage(handlerError)}`);
    return res.status(INTERNAL_ERROR).json({ code: INTERNAL_ERROR, status: KO, data: GENERIC_500 });
  }
};
