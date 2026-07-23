import { Response } from "express";
import { IDecodedTokenUser } from "../models/IDecodedTokenUser.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { BaseExceptions } from "../exceptions/BaseException.js";
import { UnauthorizedAccessException } from "../exceptions/UnauthorizedAccessException.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { LoggingUtilities } from "./logging/LoggingUtilities.js";
import { toMessage } from "./errorUtils.js";

export function getUser(req: RequestWithUserInfo): IDecodedTokenUser {
  if (!req.user) throw new UnauthorizedAccessException();
  return req.user;
}

export function hasRole(req: RequestWithUserInfo, ...roles: string[]): boolean {
  return roles.some((r) => req.user?.roles?.includes(r) ?? false);
}

export function handleException(
  err: unknown,
  cr: ControllerResponse,
  logLabel: string,
  fallback: string
): Response {
  if (err instanceof BaseExceptions) {
    return cr.result(err.httpStatus, err.name, err.toResponseMessage());
  }
  LoggingUtilities.service.error(logLabel, toMessage(err));
  return cr.ko(fallback);
}
