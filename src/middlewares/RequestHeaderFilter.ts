import { NextFunction, Request, Response } from "express";

export const RequestHeaderFilter = function (req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers["content-type"];

  // Only enforce for requests that usually have a body
  if (["POST"].includes(req.method)) {
    if (!contentType || !contentType.includes("application/json")) {
      return res.status(415).json({
        message: "Unsupported Media Type. Only application/json is allowed.",
      });
    }
  }

  next();
};
