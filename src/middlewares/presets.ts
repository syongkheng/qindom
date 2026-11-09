import { RequestHandler } from "express";
import { RestRequestLogger } from "./RestRequestLogger.js";
import { RequestHeaderFilter } from "./RequestHeaderFilter.js";
import { RequestApiKeyFilter } from "./ApiKeyFilter.js";
import { MandatoryTokenFilter } from "./TokenFilter.js";
import { houseViewLimiter, mcpLimiter } from "./RateLimiter.js";

export const mw = {
  pub:    [RestRequestLogger] as RequestHandler[],
  std:    [RestRequestLogger, RequestHeaderFilter] as RequestHandler[],
  auth:   [RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter] as RequestHandler[],
  ssKey:  [RestRequestLogger, RequestHeaderFilter, RequestApiKeyFilter("ss")] as RequestHandler[],
  // Public, stateless MCP endpoint: no auth and no RequestHeaderFilter (MCP clients send their own Accept/Content-Type, no guaranteed user-agent).
  // Public read of one shared house by its unguessable token: no auth, per-IP rate limit.
  housePublic: [RestRequestLogger, houseViewLimiter] as RequestHandler[],
  mcpPublic: [RestRequestLogger, mcpLimiter] as RequestHandler[],
};
