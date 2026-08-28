import crypto from "crypto";
import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { IDecodedTokenUser } from "../models/IDecodedTokenUser.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import db from "../config/db/mysql.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { JWT_COOKIE, CSRF_COOKIE } from "../utils/AuthCookieUtilities.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isCsrfValid(req: RequestWithUserInfo): boolean {
  if (SAFE_METHODS.has(req.method)) return true;

  const header = req.headers["x-csrf-token"];
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (typeof header !== "string" || typeof cookie !== "string" || header.length !== cookie.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
}

export const MandatoryTokenFilter = async (req: RequestWithUserInfo, res: Response, next: NextFunction) => {
  const response = new ControllerResponse(req, res);
  const jwtSecret = process.env.JWT_SECRET;

  const logContext: IRequestLogContext = req.logContext;

  const requestHeaderValidationLoggingEvent = logContext
    ? LoggingUtilities.request.branch(logContext, "VALIDATION", "JWT")
    : undefined;

  try {
    const token = req.cookies?.[JWT_COOKIE];
    if (!token) {
      requestHeaderValidationLoggingEvent?.children?.push("missing jwt cookie");
      return response.result(401, "token_invalid", "Authentication required.");
    }

    if (!jwtSecret) {
      LoggingUtilities.service.error("TokenFilter", "Missing JWT_SECRET");
      return response.ko("Server configuration error");
    }

    const decoded = jwt.verify(token, jwtSecret) as IDecodedTokenUser;

    // Verify the token matches the one stored in the DB — enables single-session revocation
    const user = await db.findOne<ITB_AA_USER>(
      "tb_aa_user",
      { username_system: `${decoded.username}_${decoded.system}`, record_status: "A" },
      ["id", "token"],
    );
    if (!user || user.token !== token) {
      return response.result(401, "token_invalid", "Your session is no longer valid. Please log in again.");
    }

    if (!isCsrfValid(req)) {
      return response.result(403, "csrf_invalid", "Invalid or missing CSRF token.");
    }

    req.user = { ...decoded, id: user.id! };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return response.result(401, "token_invalid", "Your session has expired. Please log in again.");
    }

    return response.result(401, "token_invalid", "Invalid authentication. Please log in again.");
  }
};

/**
 * OptionalTokenFilter:
 * - If a valid token exists → attaches user info to req.user (and enforces CSRF on mutating requests)
 * - If no token or invalid token → continues without error, as a visitor
 */
export const OptionalTokenFilter = (req: RequestWithUserInfo, res: Response, next: NextFunction) => {
  const response = new ControllerResponse(req, res);
  const jwtSecret = process.env.JWT_SECRET;

  try {
    const token = req.cookies?.[JWT_COOKIE];
    if (!token) {
      // No token provided → proceed as visitor
      return next();
    }

    if (!jwtSecret) {
      LoggingUtilities.service.error("OptionalTokenFilter", "Missing JWT_SECRET");
      // Proceed anyway; token cannot be verified
      return next();
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as IDecodedTokenUser;

      // A logged-in user's cookie is present — CSRF must be checked before trusting it.
      if (!isCsrfValid(req)) {
        return response.result(403, "csrf_invalid", "Invalid or missing CSRF token.");
      }

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
