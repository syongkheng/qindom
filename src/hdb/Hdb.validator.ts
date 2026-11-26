import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { CoordinateUtilities } from "../utils/CoordinateUtilities.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import {
  AddressBody,
  CoordinatesUpdateBody,
  NearbyBusStopsQuery,
  NearestMrtStationsQuery,
  PphsListQuery,
} from "./Hdb.types.js";

// Column widths: tb_hdb_pphs.batch VARCHAR(6), tb_hdb_pphs_coordinate.building VARCHAR(1024),
// lat / lng VARCHAR(16). The building key is the address with whitespace runs → "+", so never longer.
// (formed_url VARCHAR(1024) is built by the server from lat/lng, so it always fits.)
const ADDRESS_MAX_LENGTH = 1024;
const COORDINATE_MAX_LENGTH = 16;

/** `YYYYMM` with a real month. */
const BATCH_REGEX = /^\d{4}(0[1-9]|1[0-2])$/;
/** Plain decimal ("1.3521", "-0.5"); rejects "", "1e3", "0x10", "Infinity". */
const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;
const WHOLE_NUMBER_REGEX = /^\d+$/;

const LATITUDE_LIMIT = 90;
const LONGITUDE_LIMIT = 180;

/** Largest bus-stop search radius in metres (fndom's slider and the bus page go up to 2 km). */
export const NEARBY_BUS_STOPS_MAX_RADIUS_M = 5000;
export const DEFAULT_MRT_STATION_LIMIT = 3;
export const MAX_MRT_STATION_LIMIT = 10;

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

/** A latitude/longitude given as a JSON number or a decimal string, within ±`limit`. */
function requiredCoordinate(value: unknown, field: string, limit: number, event?: IRequestLogEvent): number {
  if (isBlank(value)) throw new Exceptions.InvalidRequest(field, "mandatory");
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && DECIMAL_REGEX.test(value.trim())
        ? Number(value)
        : NaN;
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

/** `GET /pphs?batch=` — optional; blank means "current month". */
export function validatePphsListQuery(query: Record<string, unknown>, event?: IRequestLogEvent): PphsListQuery {
  if (isBlank(query.batch)) return { batch: null };
  V.regex(query.batch, BATCH_REGEX, "batch", event);
  return { batch: query.batch as string };
}

export function validateAddressBody(body: Record<string, unknown>, event?: IRequestLogEvent): AddressBody {
  return { address: V.requiredText(body.address, "address", ADDRESS_MAX_LENGTH, event) };
}

/**
 * Coordinates are normalised to ≤ 8 decimals so they always fit VARCHAR(16). A `formedUrl` in the
 * body (older clients) is ignored: the server builds the link from lat/lng.
 */
export function validateCoordinatesUpdateBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): CoordinatesUpdateBody {
  const { address } = validateAddressBody(body, event);
  const lat = requiredCoordinate(body.lat, "lat", LATITUDE_LIMIT, event);
  const lng = requiredCoordinate(body.lng, "lng", LONGITUDE_LIMIT, event);
  return {
    address,
    lat: CoordinateUtilities.formatCoord(lat, COORDINATE_MAX_LENGTH)!,
    lng: CoordinateUtilities.formatCoord(lng, COORDINATE_MAX_LENGTH)!,
  };
}

/** `GET /pphs/busstops?lat=&lng=&radius=` (radius in metres; 0 is allowed and finds nothing). */
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

/** `GET /pphs/mrt?lat=&lng=&limit=` (limit optional, default 3). */
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
