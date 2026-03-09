import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/LoggingUtilities";

export const RestRequestLogger = function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  const sanitisedMessage = (message: string) => {
    return message
      .replace(/"password"\s*:\s*".*?"/gi, '"password":"[REDACTED]"')
      .replace(/"blob"\s*:\s*"[^"]*"/gi, '"blob":"[REDACTED]"')
      .replace(/"blobString"\s*:\s*"[^"]*"/gi, '"blobString":"[REDACTED]"')
      .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[REDACTED]"');
  };

  const message =
    req.method === "GET"
      ? JSON.stringify(req.query)
      : sanitisedMessage(JSON.stringify(req.body));

const ipAddress = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";

  res.on("finish", () => {
    LoggingUtilities.controller.access(
      ipAddress[0],
      req.method,
      req.originalUrl,
      req.httpVersion,
      res.statusCode,
      message
    );
  });

  next();
};
