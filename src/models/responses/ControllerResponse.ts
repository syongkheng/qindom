import { Response } from "express";
import { LoggingUtilities } from "../../utils/LoggingUtilities";

export class ControllerResponse {
  private res: Response;
  private httpMethod: string;
  private pathName: string;

  constructor(expressResponse: Response) {
    this.res = expressResponse;
    this.httpMethod = expressResponse.req.method;
    this.pathName = expressResponse.req.originalUrl;
  }

  ok(data: unknown): Response {
    const responseBody = {
      code: 200,
      status: "Ok",
      data: data,
    };
    LoggingUtilities.controller.end(
      this.httpMethod,
      this.pathName,
      JSON.stringify(responseBody)
    );
    return this.res.status(200).json(responseBody);
  }

  ko(data: unknown): Response {
    const responseBody = {
      code: 500,
      status: "Ko",
      data: data,
    };
    LoggingUtilities.controller.end(
      this.httpMethod,
      this.pathName,
      JSON.stringify(responseBody)
    );
    return this.res.status(500).json(responseBody);
  }

  badRequest(data: unknown): Response {
    const responseBody = {
      code: 400,
      status: "Ko",
      data: data,
    };
    LoggingUtilities.controller.end(
      this.httpMethod,
      this.pathName,
      JSON.stringify(responseBody)
    );
    return this.res.status(400).json(responseBody);
  }

  result(statusCode: number, message: string, data: unknown): Response {
    const responseBody = {
      code: statusCode,
      status: message,
      data: data,
    };
    LoggingUtilities.controller.end(
      this.httpMethod,
      this.pathName,
      JSON.stringify(responseBody)
    );
    return this.res.status(statusCode).json(responseBody);
  }
}
