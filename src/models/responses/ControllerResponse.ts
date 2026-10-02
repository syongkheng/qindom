import { Request, Response } from "express";
import { LoggingUtilities } from "../../utils/logging/LoggingUtilities.js";

const isPrd = process.env.NODE_ENV === "prd";

export class ControllerResponse {
  private req: Request;
  private res: Response;

  constructor(req: Request, res: Response) {
    this.req = req;
    this.res = res;
  }

  // =========================================================
  // 200 OK
  // =========================================================

  ok(data: unknown): Response {
    const responseBody = {
      code: 200,
      status: "Ok",
      data,
    };

    LoggingUtilities.request.response(
      this.req.logContext,
      200,
      LoggingUtilities.redact(data),
    );

    return this.res.status(200).json(responseBody);
  }

  // =========================================================
  // 500 ERROR
  // =========================================================

  get requestId(): string | undefined {
    return this.req.logContext?.requestId;
  }

  // `cause` carries the real exception so the request tree records what
  // actually failed (and where), not just the client-facing fallback text.
  ko(data: unknown, cause?: { source: string; error: unknown }): Response {
    if (cause) {
      LoggingUtilities.request.exception(this.req.logContext, cause.source, cause.error);
    } else {
      const serverError = typeof data === "string" ? data : JSON.stringify(data);
      LoggingUtilities.request.error(
        this.req.logContext,
        "Unhandled controller exception",
        LoggingUtilities.sanitise(serverError),
      );
    }

    const clientMessage = isPrd ? "An internal error occurred. Please try again later." : data;

    const responseBody = {
      code: 500,
      status: "Ko",
      data: clientMessage,
    };

    LoggingUtilities.request.response(
      this.req.logContext,
      500,
      LoggingUtilities.redact(responseBody),
    );

    return this.res.status(500).json(responseBody);
  }

  // =========================================================
  // 400 BAD REQUEST
  // =========================================================

  badRequest(data: unknown): Response {
    const responseBody = {
      code: 400,
      status: "Ko",
      data,
    };

    LoggingUtilities.request.branch(this.req.logContext, "WARN", "Bad request returned");

    LoggingUtilities.request.response(
      this.req.logContext,
      400,
      LoggingUtilities.redact(responseBody),
    );

    return this.res.status(400).json(responseBody);
  }

  // =========================================================
  // 400 BAD AUTHORIZATION
  // =========================================================

  badAuthorization(data: unknown): Response {
    const responseBody = {
      code: 401,
      status: "Ko",
      data,
    };

    LoggingUtilities.request.branch(this.req.logContext, "ERROR", "Bad authorization returned");

    LoggingUtilities.request.response(
      this.req.logContext,
      401,
      LoggingUtilities.redact(responseBody),
    );

    return this.res.status(401).json(responseBody);
  }

  // =========================================================
  // Generic Response
  // =========================================================

  result(statusCode: number, message: string, data: unknown): Response {
    const responseBody = {
      code: statusCode,
      status: message,
      data,
    };

    LoggingUtilities.request.response(
      this.req.logContext,
      statusCode,
      LoggingUtilities.redact(responseBody),
    );

    return this.res.status(statusCode).json(responseBody);
  }
}
