import { Request, Response } from "express";
import { IS_PRD } from "../../config/env.js";
import { LoggingUtilities } from "../../utils/logging/LoggingUtilities.js";

export const ResponseStatus = {
  OK: "Ok",
  KO: "Ko",
} as const;

const PRD_INTERNAL_ERROR_MESSAGE = "An internal error occurred. Please try again later.";

/**
 * Builds the `{ code, status, data }` envelope, records the response in the
 * request log tree, and sends it. The only place that should write responses.
 */
export class ControllerResponse {
  constructor(
    private readonly req: Request,
    private readonly res: Response,
  ) {}

  get requestId(): string | undefined {
    return this.req.logContext?.requestId;
  }

  /**
   * 200 Ok. Only `data` is logged (not the envelope).
   * Always pass the DTO type so the controller shows what it returns: `cr.ok<XyzDto>(...)`.
   */
  ok<T>(data: T): Response {
    LoggingUtilities.request.response(this.req.logContext, 200, LoggingUtilities.redact(data));
    return this.res.status(200).json({ code: 200, status: ResponseStatus.OK, data });
  }

  /**
   * 500 Ko. `cause` carries the real exception so the request tree records what
   * actually failed (and where), not just the client-facing fallback text.
   * In prd the client only ever sees a generic message.
   */
  ko(data: unknown, cause: { source: string; error: unknown }): Response {
    LoggingUtilities.request.exception(this.req.logContext, cause.source, cause.error);
    return this.send(500, ResponseStatus.KO, IS_PRD ? PRD_INTERNAL_ERROR_MESSAGE : data);
  }

  /** 401 Ko (plain-string body; the x-api-key contract in `ApiKeyFilter`). */
  badAuthorization(data: unknown): Response {
    LoggingUtilities.request.branch(this.req.logContext, "ERROR", "Bad authorization returned");
    return this.send(401, ResponseStatus.KO, data);
  }

  /** Any status. `status` is the envelope's status text (e.g. the exception name). */
  result(statusCode: number, status: string, data: unknown): Response {
    return this.send(statusCode, status, data);
  }

  private send(code: number, status: string, data: unknown): Response {
    const responseBody = { code, status, data };
    LoggingUtilities.request.response(this.req.logContext, code, LoggingUtilities.redact(responseBody));
    return this.res.status(code).json(responseBody);
  }
}
