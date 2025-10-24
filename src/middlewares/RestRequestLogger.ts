import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/LoggingUtilities";

export const RestRequestLogger = function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  const sanitisedMessage = (message: string) => {
    // Simple sanitization to avoid logging sensitive info like passwords
    return message.replace(
      /"password"\s*:\s*".*?"/gi,
      '"password":"[REDACTED]"'
    );
  };
  
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
      sanitisedMessage(JSON.stringify(req.body))
    );
  }

  next();
};
