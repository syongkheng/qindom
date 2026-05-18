import { Response } from "express";
import { IDecodedTokenUser } from "../token/Token.service";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { BaseExceptions } from "../exceptions/BaseException";
import { UnauthorizedAccessException } from "../exceptions/UnauthorizedAccessException";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { LoggingUtilities } from "./logging/LoggingUtilities";
import { toMessage } from "./errorUtils";

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
    return cr.result(err.httpStatus, err.name, err.clientMessage);
  }
  LoggingUtilities.service.error(logLabel, toMessage(err));
  return cr.ko(fallback);
}
