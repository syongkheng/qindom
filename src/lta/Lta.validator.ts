import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { BusStopCodeQuery } from "./Lta.types.js";

// LTA bus stop codes are always 5 digits (e.g. "53231").
const BUS_STOP_CODE_REGEX = /^\d{5}$/;

/** Validates `busStopCode` from a request's query string. */
export function validateBusStopCodeQuery(query: Record<string, unknown>, event?: IRequestLogEvent): BusStopCodeQuery {
  V.requiredString(query.busStopCode, "busStopCode", event);
  const busStopCode = (query.busStopCode as string).trim();
  V.regex(busStopCode, BUS_STOP_CODE_REGEX, "busStopCode", event);
  return { busStopCode };
}
