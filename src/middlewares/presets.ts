import { RequestHandler } from "express";
import { RestRequestLogger } from "./RestRequestLogger.js";
import { RequestHeaderFilter } from "./RequestHeaderFilter.js";
import { RequestApiKeyFilter } from "./ApiKeyFilter.js";
import { MandatoryTokenFilter } from "./TokenFilter.js";

export const mw = {
  pub:    [RestRequestLogger] as RequestHandler[],
  std:    [RestRequestLogger, RequestHeaderFilter] as RequestHandler[],
  auth:   [RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter] as RequestHandler[],
  apiKey: [RestRequestLogger, RequestHeaderFilter, RequestApiKeyFilter] as RequestHandler[],
};
