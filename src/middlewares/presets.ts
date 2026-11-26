import { RequestHandler } from "express";
import { RestRequestLogger } from "./RestRequestLogger.js";
import { RequestHeaderFilter } from "./RequestHeaderFilter.js";
import { RequestApiKeyFilter } from "./ApiKeyFilter.js";
import { MandatoryTokenFilter } from "./TokenFilter.js";
import { houseViewLimiter } from "./RateLimiter.js";
import { stripPersonalDataFromLog } from "../pdca/PdcaEnquiry.middleware.js";

/** The middleware chains route groups are mounted with in index.ts. Every chain starts with RestRequestLogger. */
export const mw = {
  pub: [RestRequestLogger],
  std: [RestRequestLogger, RequestHeaderFilter],
  auth: [RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter],
  // Multipart uploads (`/img/upload`): no RequestHeaderFilter, which would 415 a non-JSON POST.
  authUpload: [RestRequestLogger, MandatoryTokenFilter],
  ssKey: [RestRequestLogger, RequestHeaderFilter, RequestApiKeyFilter("ss")],
  // Public read of one shared house by its unguessable token: no auth, per-IP rate limit.
  housePublic: [RestRequestLogger, houseViewLimiter],
  // PDCA contact form: the logged body is reduced to field lengths before anything else runs.
  pdcaPublic: [RestRequestLogger, stripPersonalDataFromLog, RequestHeaderFilter],
} satisfies Record<string, RequestHandler[]>;
