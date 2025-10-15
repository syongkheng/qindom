import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/LoggingUtilities";

export const RestRequestLogger = function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.method === "GET") {
    LoggingUtilities.controller.start(
      req.method,
      req.originalUrl,
      JSON.stringify(req.query)
    );
  } else {
    LoggingUtilities.controller.start(
      req.method,
      req.originalUrl,
      JSON.stringify(req.body)
    );
  }

  next();
};
