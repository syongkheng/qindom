import { Request, RequestHandler, Response } from "express";
import { BaseException, Exceptions } from "../exceptions/AppExceptions.js";
import { IDecodedTokenUser } from "../models/IDecodedTokenUser.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { LoggingUtilities } from "./logging/LoggingUtilities.js";
import { toMessage } from "./errorUtils.js";

export function getUser(req: RequestWithUserInfo): IDecodedTokenUser {
  if (!req.user) throw new Exceptions.UnauthorizedAccess();
  return req.user;
}

/**
 * The user resolved by `RequestApiKeyFilter` (x-api-key routes). It stores the id in
 * `logContext.metadata.userId`, not `req.user`; throws 401 if it's missing.
 */
export function getApiKeyUserId(req: Request): number {
  const userId = req.logContext?.metadata?.userId;
  if (typeof userId !== "number") throw new Exceptions.UnauthorizedAccess();
  return userId;
}

export function hasRole(req: RequestWithUserInfo, ...roles: string[]): boolean {
  return roles.some((r) => req.user?.roles?.includes(r) ?? false);
}

/** Throws `Exceptions.ForbiddenAccess` unless the user has at least one of `roles`. */
export function requireRole(req: RequestWithUserInfo, ...roles: string[]): void {
  if (!hasRole(req, ...roles)) throw new Exceptions.ForbiddenAccess("Insufficient permissions");
}

export function handleException(err: unknown, cr: ControllerResponse, logLabel: string, fallback: string): Response {
  if (err instanceof BaseException) {
    return cr.result(err.httpStatus, err.name, err.toResponseMessage());
  }
  // One-liner for PM2's error log, tagged so it can be matched to the request tree
  LoggingUtilities.service.error(logLabel, `${cr.requestId ?? "no-request-id"} ${toMessage(err)}`);
  return cr.ko(fallback, { source: logLabel, error: err });
}

export type RouteHandler<R extends Request = Request> = (
  req: R,
  cr: ControllerResponse,
  res: Response,
) => Promise<Response | void> | Response | void;

/**
 * Wraps a controller handler with the standard response + exception plumbing:
 * builds the `ControllerResponse`, and routes any thrown error through
 * `handleException` (typed `BaseException` → their status, anything else → 500 with `fallback`).
 *
 * @param label    `"<Module>Controller.<METHOD> <path>"`, used in logs and the request tree
 * @param fallback client-facing message for unexpected (non-typed) errors
 */
export function route<R extends Request = Request>(
  label: string,
  fallback: string,
  handler: RouteHandler<R>,
): RequestHandler {
  return async (req, res) => {
    const cr = new ControllerResponse(req, res);
    try {
      await handler(req as R, cr, res);
    } catch (err) {
      handleException(err, cr, label, fallback);
    }
  };
}
