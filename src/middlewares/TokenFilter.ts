import crypto from "crypto";
import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { IDecodedTokenUser } from "../models/IDecodedTokenUser.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import db from "../config/db/mysql.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { JWT_COOKIE, CSRF_COOKIE } from "../utils/AuthCookieUtilities.js";
import { verifyToken } from "../token/Token.service.js";
import { parseRoles } from "../auth/Permission.js";

const USER_TABLE = "tb_aa_user";
const SESSION_COLUMNS = ["id", "token", "roles"] as const;
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// fndom contract: HttpClient treats `401` + envelope status `token_invalid` as "logged out", so these
// two keep their custom status text and plain-string data instead of the registry error shape.
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const TOKEN_INVALID = "token_invalid";
const CSRF_INVALID = "csrf_invalid";
const AUTH_REQUIRED_MESSAGE = "Authentication required.";
const SESSION_REVOKED_MESSAGE = "Your session is no longer valid. Please log in again.";
const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again.";
const INVALID_TOKEN_MESSAGE = "Invalid authentication. Please log in again.";
const CSRF_INVALID_MESSAGE = "Invalid or missing CSRF token.";

/** Double-submit check: on non-safe methods the `X-CSRF-Token` header must equal the `csrf_token` cookie (timing-safe). */
function isCsrfValid(req: RequestWithUserInfo): boolean {
  if (SAFE_METHODS.has(req.method)) return true;

  const header = req.headers[CSRF_HEADER];
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (typeof header !== "string" || typeof cookie !== "string" || header.length !== cookie.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
}

/**
 * Verifies the JWT, then checks it is still the user's current token in the DB (single-session
 * revocation: logout / password change rotate it). Id and roles come from the DB row, not the JWT.
 * Returns null when the user is gone or the token was rotated; throws jsonwebtoken's errors for a
 * bad/expired token and the DB's error if the lookup fails.
 */
async function loadSessionUser(token: string, event?: IRequestLogEvent): Promise<IDecodedTokenUser | null> {
  const decoded = verifyToken(token);
  const user = await db.findOne<ITB_AA_USER>(
    USER_TABLE,
    { username_system: `${decoded.username}_${decoded.system}`, record_status: RecordStatus.ACTIVE },
    SESSION_COLUMNS,
    event,
  );
  if (!user || user.token !== token) return null;
  return { ...decoded, id: user.id!, roles: parseRoles(user.roles) };
}

/**
 * Same JWT + DB revocation check as MandatoryTokenFilter, for callers outside the
 * Express chain (the camera dashboard WebSocket upgrade). Returns null when the
 * token is missing, invalid, expired or no longer the user's current token.
 * CSRF is the caller's job (WebSockets check Origin instead).
 */
export async function resolveSessionUser(token: string | undefined): Promise<IDecodedTokenUser | null> {
  if (!token) return null;
  try {
    return await loadSessionUser(token);
  } catch {
    return null;
  }
}

/**
 * Requires a valid session cookie (401 `token_invalid` otherwise) and, on mutating requests, a
 * matching CSRF header (403 `csrf_invalid`), checked after the session. Sets `req.user`.
 */
export const MandatoryTokenFilter = async (req: RequestWithUserInfo, res: Response, next: NextFunction) => {
  const cr = new ControllerResponse(req, res);
  const event = LoggingUtilities.request.middleware(req.logContext, "VALIDATION", "JWT");

  const token = req.cookies?.[JWT_COOKIE];
  if (!token) {
    event.children.push("missing jwt cookie");
    return cr.result(UNAUTHORIZED, TOKEN_INVALID, AUTH_REQUIRED_MESSAGE);
  }

  // One try for the whole check (pinned): a DB failure, or a CSRF header whose byte length differs
  // from the cookie's, is answered as an invalid session.
  try {
    const user = await loadSessionUser(token, event);
    if (!user) {
      event.children.push("token revoked or user inactive");
      return cr.result(UNAUTHORIZED, TOKEN_INVALID, SESSION_REVOKED_MESSAGE);
    }
    if (!isCsrfValid(req)) {
      event.children.push("csrf mismatch");
      return cr.result(FORBIDDEN, CSRF_INVALID, CSRF_INVALID_MESSAGE);
    }
    req.user = user;
  } catch (error) {
    const expired = error instanceof jwt.TokenExpiredError;
    event.children.push(expired ? "jwt expired" : "jwt invalid or check failed");
    return cr.result(UNAUTHORIZED, TOKEN_INVALID, expired ? SESSION_EXPIRED_MESSAGE : INVALID_TOKEN_MESSAGE);
  }
  next();
};

/**
 * Attaches `req.user` when the session cookie is valid (and then enforces CSRF on mutating
 * requests, 403). No cookie, a bad/expired/revoked token or a failed check → continues as a
 * visitor; it never answers 401.
 */
export const OptionalTokenFilter = async (req: RequestWithUserInfo, res: Response, next: NextFunction) => {
  const token = req.cookies?.[JWT_COOKIE];
  if (!token) return next();

  const event = LoggingUtilities.request.middleware(req.logContext, "VALIDATION", "JWT (optional)");
  try {
    const user = await loadSessionUser(token, event);
    if (!user) {
      event.children.push("token revoked or user inactive → visitor");
      return next();
    }
    // A logged-in user's cookie is present: CSRF must be checked before trusting it.
    if (!isCsrfValid(req)) {
      event.children.push("csrf mismatch");
      return new ControllerResponse(req, res).result(FORBIDDEN, CSRF_INVALID, CSRF_INVALID_MESSAGE);
    }
    req.user = user;
  } catch {
    event.children.push("jwt invalid or check failed → visitor");
  }
  next();
};
