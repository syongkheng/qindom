import { NextFunction, Request, Response } from "express";
import { MandatoryTokenFilter } from "./TokenFilter.js";
import { RequestApiKeyFilter } from "./ApiKeyFilter.js";

/**
 * Accepts either a JWT (httpOnly cookie) for normal app users,
 * or an x-api-key — whichever is present.
 */
const apiKeyFilter = RequestApiKeyFilter("ss");

export const MandatoryTokenOrApiKeyFilter = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers["x-api-key"]) {
    return apiKeyFilter(req, res, next);
  }
  return MandatoryTokenFilter(req, res, next);
};
