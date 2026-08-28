import { NextFunction, Response } from "express";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { MandatoryTokenFilter } from "./TokenFilter.js";
import { RequestApiKeyFilter } from "./ApiKeyFilter.js";

/**
 * Accepts either a JWT (httpOnly cookie) for normal app users,
 * or an x-api-key (e.g. aig_... for AI agents) — whichever is present.
 */
export const MandatoryTokenOrApiKeyFilter = (req: RequestWithUserInfo, res: Response, next: NextFunction) => {
  if (req.headers["x-api-key"]) {
    return RequestApiKeyFilter(req, res, next);
  }
  return MandatoryTokenFilter(req, res, next);
};
