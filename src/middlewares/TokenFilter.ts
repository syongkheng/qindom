import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { IDecodedTokenUser } from "../models/IDecodedTokenUser";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { ITB_AA_USER } from "../models/databases/tb_aa_user";
import db from "../config/db/mysql";
import { IRequestLogContext } from "../models/IRequestLogContext";
import { HeaderValidationUtilities } from "../utils/HeaderValidationUtilities";

export const MandatoryTokenFilter = async (req: RequestWithUserInfo, res: Response, next: NextFunction) => {
  const response = new ControllerResponse(req, res);
  const jwtSecret = process.env.JWT_SECRET;

  const logContext: IRequestLogContext = req.logContext;

  const requestHeaderValidationLoggingEvent = logContext
    ? LoggingUtilities.request.branch(logContext, "VALIDATION", "JWT")
    : undefined;

  try {
    const authHeader = HeaderValidationUtilities.required(
      req.headers,
      "authorization",
      requestHeaderValidationLoggingEvent,
    );
    if (!authHeader?.startsWith("Bearer ")) {
      return response.badAuthorization("Invalid Header - Authorization");
    }

    if (!jwtSecret) {
      LoggingUtilities.service.error("TokenFilter", "Missing JWT_SECRET");
      return response.ko("Server configuration error");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, jwtSecret) as IDecodedTokenUser;

    // Verify the token matches the one stored in the DB — enables single-session revocation
    const user = await db.findOne<ITB_AA_USER>(
      "tb_aa_user",
      { username_system: `${decoded.username}_${decoded.system}`, record_status: "A" },
      ["token"],
    );
    if (!user || user.token !== token) {
      return response.badAuthorization("Token revoked or invalid");
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return response.badAuthorization("Token expired");
    }

    return response.badAuthorization("Invalid token");
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
