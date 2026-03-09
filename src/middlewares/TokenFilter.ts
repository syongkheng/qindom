import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { IDecodedTokenUser } from "../token/Token.service";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";

export const MandatoryTokenFilter = (req: RequestWithUserInfo, res: Response, next: NextFunction) => {
  /**
   * Token validity is 1 year as configured in Token.service.ts
   */
  const response = new ControllerResponse(res);
  const jwtSecret = process.env.JWT_SECRET;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return response.badRequest("Invalid Header - Authorization");
    }

    if (!jwtSecret) {
      LoggingUtilities.service.error("TokenFilter", "Missing JWT_SECRET");
      return response.ko("Server configuration error");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, jwtSecret) as IDecodedTokenUser;

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: "Token expired" });
    }

    return res.status(401).json({ message: "Invalid token" });
  }
};

/**
 * OptionalTokenFilter:
 * - If a valid token exists → attaches user info to req.user
 * - If no token or invalid token → continues without error
 */
export const OptionalTokenFilter = (req: RequestWithUserInfo, res: Response, next: NextFunction) => {
  const jwtSecret = process.env.JWT_SECRET;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      // No token provided → proceed as visitor
      return next();
    }

    if (!jwtSecret) {
      LoggingUtilities.service.error("OptionalTokenFilter", "Missing JWT_SECRET");
      // Proceed anyway; token cannot be verified
      return next();
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, jwtSecret) as IDecodedTokenUser;
      req.user = decoded; // Attach user info
    } catch (err) {
      // Token invalid or expired → treat as visitor, don't throw
      LoggingUtilities.service.warn("OptionalTokenFilter", "Invalid token, proceeding as visitor");
    }

    next();
  } catch (error) {
    // Fallback: never block the request
    LoggingUtilities.service.error("OptionalTokenFilter", "Something went wrong");
    next();
  }
};
