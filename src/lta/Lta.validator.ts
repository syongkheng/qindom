import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { BusStopCodeQuery, NearbyBusStopsQuery, NearestMrtStationsQuery } from "./Lta.types.js";

// LTA bus stop codes are always 5 digits (e.g. "53231").
const BUS_STOP_CODE_REGEX = /^\d{5}$/;

/** Plain decimal ("1.3521", "-0.5"); rejects "", "1e3", "0x10", "Infinity". */
const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;
const WHOLE_NUMBER_REGEX = /^\d+$/;

const LATITUDE_LIMIT = 90;
const LONGITUDE_LIMIT = 180;

/** Largest bus-stop search radius in metres (fndom's flat card slider and the bus page go up to 2 km). */
export const NEARBY_BUS_STOPS_MAX_RADIUS_M = 5000;
export const DEFAULT_MRT_STATION_LIMIT = 3;
export const MAX_MRT_STATION_LIMIT = 10;

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

/** Validates `busStopCode` from a request's query string. */
export function validateBusStopCodeQuery(query: Record<string, unknown>, event?: IRequestLogEvent): BusStopCodeQuery {
  V.requiredString(query.busStopCode, "busStopCode", event);
  const busStopCode = (query.busStopCode as string).trim();
  V.regex(busStopCode, BUS_STOP_CODE_REGEX, "busStopCode", event);
  return { busStopCode };
}

/** A latitude/longitude from the query string as a decimal, within ±`limit`. */
function requiredCoordinate(value: unknown, field: string, limit: number, event?: IRequestLogEvent): number {
  if (isBlank(value)) throw new Exceptions.InvalidRequest(field, "mandatory");
  const parsed = typeof value === "string" && DECIMAL_REGEX.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) {
    if (event) event.children?.push(`(M) '${field}' within ±${limit} ${LogEmoji.error} `);
    throw new Exceptions.InvalidRequest(field, "format");
  }
  return parsed;
}

/** A whole number from the query string, within `min..max`. */
function wholeNumberParam(value: unknown, field: string, min: number, max: number): number {
  if (isBlank(value)) throw new Exceptions.InvalidRequest(field, "mandatory");
  if (typeof value !== "string" || !WHOLE_NUMBER_REGEX.test(value))
    throw new Exceptions.InvalidRequest(field, "format");
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new Exceptions.InvalidRequest(field, "format");
  return parsed;
}

/** `GET /bus-stops/nearby?lat=&lng=&radius=` (radius in metres; 0 is allowed and finds nothing). */
export function validateNearbyBusStopsQuery(
  query: Record<string, unknown>,
  event?: IRequestLogEvent,
): NearbyBusStopsQuery {
  return {
    lat: requiredCoordinate(query.lat, "lat", LATITUDE_LIMIT, event),
    lng: requiredCoordinate(query.lng, "lng", LONGITUDE_LIMIT, event),
    radiusM: wholeNumberParam(query.radius, "radius", 0, NEARBY_BUS_STOPS_MAX_RADIUS_M),
  };
}

/** `GET /mrt-stations/nearest?lat=&lng=&limit=` (limit optional, default 3). */
export function validateNearestMrtStationsQuery(
  query: Record<string, unknown>,
  event?: IRequestLogEvent,
): NearestMrtStationsQuery {
  return {
    lat: requiredCoordinate(query.lat, "lat", LATITUDE_LIMIT, event),
    lng: requiredCoordinate(query.lng, "lng", LONGITUDE_LIMIT, event),
    limit: isBlank(query.limit)
      ? DEFAULT_MRT_STATION_LIMIT
      : wholeNumberParam(query.limit, "limit", 1, MAX_MRT_STATION_LIMIT),
  };
}
