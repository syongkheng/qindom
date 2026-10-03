import { STATUS_CODES } from "node:http";
import { ErrorRequestHandler } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { BaseExceptions } from "../exceptions/BaseException.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/errorUtils.js";

const GENERIC_500 = "An internal error occurred. Please try again later.";

// Client-safe status + message for an error that escaped a controller's own
// try/catch, or null when it should be treated as an unexpected 500.
function toClientError(err: unknown): { status: number; message: unknown } | null {
  if (err instanceof BaseExceptions) {
    return { status: err.httpStatus, message: err.toResponseMessage() };
  }
  // Matched by shape rather than instanceof multer.MulterError, which misses
  // when more than one copy of multer gets loaded.
  const m = err as { name?: unknown; code?: unknown; message?: unknown };
  if (m?.name === "MulterError" && typeof m.code === "string") {
    return { status: m.code === "LIMIT_FILE_SIZE" ? 413 : 400, message: String(m.message) };
  }
  // http-errors shape: body-parser (malformed JSON, payload too large) and the
  // CORS rejection in index.ts. `expose` marks the message as safe for clients.
  const e = err as { status?: unknown; expose?: unknown; type?: unknown; message?: unknown };
  if (typeof e?.status === "number" && e.status >= 400 && e.status < 500) {
    if (e.type === "entity.parse.failed") return { status: 400, message: "Malformed JSON body" };
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
 * directly instead of through ControllerResponse.
 */
export const ErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Mid-stream failure (e.g. /img piping): too late for a body — let Express
  // close the connection.
  if (res.headersSent) return next(err);

  try {
    const clientError = toClientError(err);
    const status = clientError?.status ?? 500;
    const statusText = STATUS_CODES[status] ?? "Ko";

    if (req.logContext) {
      const cr = new ControllerResponse(req, res);
      if (!clientError) return cr.ko(GENERIC_500, { source: "ErrorHandler", error: err });
      return cr.result(status, statusText, clientError.message);
    }

    if (!clientError) {
      LoggingUtilities.service.error("ErrorHandler", `${req.method} ${req.path} ${toMessage(err)}`);
    }
    return res.status(status).json({
      code: status,
      status: clientError ? statusText : "Ko",
      data: clientError ? clientError.message : GENERIC_500,
    });
  } catch (handlerError) {
    LoggingUtilities.service.error("ErrorHandler", `Failed to handle error: ${toMessage(handlerError)}`);
    return res.status(500).json({ code: 500, status: "Ko", data: GENERIC_500 });
  }
};
