import { Request, Response } from "express";
import { LoggingUtilities } from "../../utils/logging/LoggingUtilities";

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
      JSON.parse(LoggingUtilities.sanitise(JSON.stringify(data))),
    );

    return this.res.status(200).json(responseBody);
  }

  // =========================================================
  // 500 ERROR
  // =========================================================

  ko(data: unknown): Response {
    const serverError = typeof data === "string" ? data : JSON.stringify(data);

    LoggingUtilities.request.error(
      this.req.logContext,
      "Unhandled controller exception",
      LoggingUtilities.sanitise(serverError),
    );

    const clientMessage = isPrd ? "An internal error occurred. Please try again later." : data;

    const responseBody = {
      code: 500,
      status: "Ko",
      data: clientMessage,
    };

    LoggingUtilities.request.response(
      this.req.logContext,
      500,
      JSON.parse(LoggingUtilities.sanitise(JSON.stringify(responseBody))),
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
      JSON.parse(LoggingUtilities.sanitise(JSON.stringify(responseBody))),
    );

    return this.res.status(400).json(responseBody);
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
      JSON.parse(LoggingUtilities.sanitise(JSON.stringify(responseBody))),
    );

    return this.res.status(statusCode).json(responseBody);
  }
}
