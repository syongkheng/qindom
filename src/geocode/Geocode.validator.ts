import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";

// Search text cap (Nominatim queries are short); well under tb_geocode_cache.query VARCHAR(512).
export const GEOCODE_QUERY_MAX_LENGTH = 200;

/** `GET /geocode?q=`: trimmed, 1–200 characters (code points); missing, blank or longer → 400 `invalid_request_q`. */
export function validateGeocodeQuery(value: unknown, event?: IRequestLogEvent): string {
  return V.requiredText(String(value ?? ""), "q", GEOCODE_QUERY_MAX_LENGTH, event);
}
