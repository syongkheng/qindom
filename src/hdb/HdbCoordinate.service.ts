import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ITB_HDB_PPHS_COORDINATE } from "../models/databases/tb_hdb_pphs_coordinate.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { searchNominatim } from "../geocode/Geocode.service.js";
import {
  CoordinateOptionDto,
  CoordinateSource,
  CoordinatesClearedDto,
  CoordinatesDto,
  CoordinatesUpdateBody,
  CoordinatesUpdatedDto,
  ResolvedCoordinatesDto,
} from "./Hdb.types.js";

const HDB_PPHS_COORDINATE_TABLE = "tb_hdb_pphs_coordinate";
/** `created_by` for rows written by the geocoding cache rather than a person. */
const SYSTEM_USER = "SYSTEM";

// OneMap Search API (Singapore Land Authority, no auth): https://www.onemap.gov.sg/apidocs/apidocs/#search
const ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";
const ONEMAP_HEADERS = { "User-Agent": "fndom-server/1.0" };
/** Small pause before each OneMap call so a cold PPHS list doesn't burst it. */
const ONEMAP_DELAY_MS = 300;
// Nominatim goes through geocode's shared 1 req/s queue (searchNominatim).
const NOMINATIM_COUNTRY_CODE = "sg";
const NOMINATIM_COUNTRY_SUFFIX = " Singapore";
const NOMINATIM_RESULT_LIMIT = 1;

const GOOGLE_MAPS_URL = "https://www.google.com/maps";
/** "Blk 36, 43 & 44 Tanglin Halt Road" names several blocks: no single point, so it's cached as blank. */
const MULTI_BLOCK_MARKER = "&";

const NO_COORDINATES: CoordinatesDto = { lat: "", lng: "", formedUrl: "" };

interface OneMapResponse {
  found?: number;
  results?: { LATITUDE?: string; LONGITUDE?: string }[];
}

/**
 * The cache key (`tb_hdb_pphs_coordinate.building`): the address with each whitespace run → "+".
 * Existing rows use this form, so don't change it.
 */
export function toBuildingKey(address: string): string {
  return address.replace(/\s+/g, "+");
}

const fromBuildingKey = (building: string) => building.replace(/\+/g, " ");

/** Stored as `formed_url`. Kept as a plain `?q=lat,lng` (no %2C) to match the existing rows; both parts are numeric. */
export function googleMapsUrl(lat: string, lng: string): string {
  return `${GOOGLE_MAPS_URL}?q=${lat},${lng}`;
}

const pointOf = (lat: string, lng: string): CoordinatesDto => ({ lat, lng, formedUrl: googleMapsUrl(lat, lng) });

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Owns `tb_hdb_pphs_coordinate`: a geocoding cache for PPHS addresses (DB → OneMap → Nominatim),
 * plus the admin overrides (pick an option, set by hand, clear, refresh).
 */
export class HdbCoordinateService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Coordinates for an address: the cached row if there is one, otherwise OneMap, then Nominatim
   * (the hit is cached). Multi-block addresses are cached as blank. Geocoder failures give
   * `source: "error"` and are not cached, so the next call retries. Called by HdbService inside its event.
   */
  async resolve(address: string, event?: IRequestLogEvent): Promise<ResolvedCoordinatesDto> {
    const building = toBuildingKey(address);

    const cached = await this.findCached(building, event);
    if (cached) return cached;

    if (address.includes(MULTI_BLOCK_MARKER)) {
      await this.storeBestEffort(building, NO_COORDINATES, event);
      return { ...NO_COORDINATES, source: CoordinateSource.UNPARSEABLE };
    }

    const query = fromBuildingKey(building);
    await wait(ONEMAP_DELAY_MS);
    const oneMap = await this.fetchOneMap(query);
    if (oneMap) {
      await this.storeBestEffort(building, oneMap, event);
      return { ...oneMap, source: CoordinateSource.ONEMAP };
    }

    const nominatim = await this.fetchNominatim(query);
    if (nominatim) {
      await this.storeBestEffort(building, nominatim, event);
      return { ...nominatim, source: CoordinateSource.NOMINATIM };
    }

    LoggingUtilities.service.warn("HdbCoordinateService.resolve", `No coordinates resolved for: ${address}`);
    return { ...NO_COORDINATES, source: CoordinateSource.ERROR };
  }

  /** What each geocoder says right now (nothing is cached); `[]` when neither finds it. */
  async listOptions(address: string, logContext?: IRequestLogContext): Promise<CoordinateOptionDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "PPHS coordinate options");
    const query = fromBuildingKey(toBuildingKey(address));
    const [oneMap, nominatim] = await Promise.all([this.fetchOneMap(query), this.fetchNominatim(query)]);
    const options: CoordinateOptionDto[] = [];
    if (oneMap) options.push({ ...oneMap, source: CoordinateSource.ONEMAP });
    if (nominatim) options.push({ ...nominatim, source: CoordinateSource.NOMINATIM });
    if (event) event.detail = `${options.length} option(s)`;
    return options;
  }

  /** Drops the cached coordinates and geocodes the address again. */
  async refresh(address: string, logContext?: IRequestLogContext): Promise<ResolvedCoordinatesDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "PPHS coordinate refresh");
    await this.db.delete<ITB_HDB_PPHS_COORDINATE>(
      HDB_PPHS_COORDINATE_TABLE,
      { building: toBuildingKey(address) },
      event,
    );
    const resolved = await this.resolve(address, event);
    if (event) event.detail = `source ${resolved.source}`;
    return resolved;
  }

  /** Replaces the cached coordinates with a blank row, so the address stays off the map (no re-geocoding). */
  async clear(address: string, logContext?: IRequestLogContext): Promise<CoordinatesClearedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "PPHS coordinate clear");
    const building = toBuildingKey(address);
    await this.db.delete<ITB_HDB_PPHS_COORDINATE>(HDB_PPHS_COORDINATE_TABLE, { building }, event);
    await this.insert(building, NO_COORDINATES, event);
    return { cleared: true };
  }

  /**
   * Admin override (upsert): overwrites the address's cached rows, or creates the row when there is
   * none (e.g. both geocoders failed). `formedUrl` is always built here from lat/lng. The table has no
   * source column, so a manual point reads back as `source: "database"` like any cached one.
   */
  async update(
    body: CoordinatesUpdateBody,
    username: string,
    logContext?: IRequestLogContext,
  ): Promise<CoordinatesUpdatedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "PPHS coordinate update");
    const building = toBuildingKey(body.address);
    const point = pointOf(body.lat, body.lng);
    const now = Date.now();
    const rows = await this.db.update<ITB_HDB_PPHS_COORDINATE>(
      HDB_PPHS_COORDINATE_TABLE,
      { building },
      { formed_url: point.formedUrl, lat: point.lat, lng: point.lng, modified_dt: now, modified_by: username },
      event,
    );
    if (rows.length) {
      if (event) event.detail = `${rows.length} row(s) updated`;
      return { ...point, updated: rows.length, created: false };
    }

    await this.db.insert<ITB_HDB_PPHS_COORDINATE>(
      HDB_PPHS_COORDINATE_TABLE,
      {
        building,
        formed_url: point.formedUrl,
        lat: point.lat,
        lng: point.lng,
        created_dt: now,
        created_by: username,
        modified_dt: now,
        modified_by: username,
      },
      event,
    );
    if (event) event.detail = "row created";
    return { ...point, updated: 1, created: true };
  }

  // ── Cache ──

  private async findCached(building: string, event?: IRequestLogEvent): Promise<ResolvedCoordinatesDto | null> {
    const [row] = await this.db.find<ITB_HDB_PPHS_COORDINATE>(
      HDB_PPHS_COORDINATE_TABLE,
      { building },
      { limit: 1, orderBy: "created_dt", orderDirection: "desc", columns: ["formed_url", "lat", "lng"] },
      event,
    );
    if (!row) return null;
    if (!row.lat || !row.lng) return { ...NO_COORDINATES, source: CoordinateSource.UNPARSEABLE };
    return { lat: row.lat, lng: row.lng, formedUrl: row.formed_url ?? "", source: CoordinateSource.DATABASE };
  }

  private async insert(building: string, coordinates: CoordinatesDto, event?: IRequestLogEvent): Promise<void> {
    await this.db.insert<ITB_HDB_PPHS_COORDINATE>(
      HDB_PPHS_COORDINATE_TABLE,
      {
        building,
        formed_url: coordinates.formedUrl,
        lat: coordinates.lat,
        lng: coordinates.lng,
        created_dt: Date.now(),
        created_by: SYSTEM_USER,
      },
      event,
    );
  }

  /** Cache writes while resolving never fail the request; the address is just geocoded again next time. */
  private async storeBestEffort(building: string, coordinates: CoordinatesDto, event?: IRequestLogEvent) {
    try {
      await this.insert(building, coordinates, event);
    } catch (error) {
      LoggingUtilities.service.error(
        "HdbCoordinateService.storeBestEffort",
        `Cache write failed for ${building}: ${toMessage(error)}`,
      );
    }
  }

  // ── Geocoders (null on any failure, so the next source can be tried) ──

  private async fetchOneMap(query: string): Promise<CoordinatesDto | null> {
    const params = new URLSearchParams({ searchVal: query, returnGeom: "Y", getAddrDetails: "N", pageNum: "1" });
    const url = `${ONEMAP_SEARCH_URL}?${params}`;
    LoggingUtilities.service.info("HdbCoordinateService.fetchOneMap", `[EXT-GET] ${url}`);
    try {
      const response = await fetch(url, { headers: ONEMAP_HEADERS });
      if (!response.ok) {
        LoggingUtilities.service.warn("HdbCoordinateService.fetchOneMap", `HTTP ${response.status} for ${query}`);
        return null;
      }
      const data = (await response.json()) as OneMapResponse;
      const first = data.found ? data.results?.[0] : undefined;
      if (!first?.LATITUDE || !first.LONGITUDE) return null;
      return pointOf(first.LATITUDE, first.LONGITUDE);
    } catch (error) {
      LoggingUtilities.service.error("HdbCoordinateService.fetchOneMap", `Failed for ${query}: ${toMessage(error)}`);
      return null;
    }
  }

  private async fetchNominatim(query: string): Promise<CoordinatesDto | null> {
    try {
      const results = await searchNominatim({
        q: `${query}${NOMINATIM_COUNTRY_SUFFIX}`,
        countrycodes: NOMINATIM_COUNTRY_CODE,
        limit: String(NOMINATIM_RESULT_LIMIT),
      });
      const first = results?.[0];
      if (!first?.lat || !first.lon) return null;
      return pointOf(first.lat, first.lon);
    } catch (error) {
      // searchNominatim throws only when its queue is full.
      LoggingUtilities.service.warn("HdbCoordinateService.fetchNominatim", `Skipped for ${query}: ${toMessage(error)}`);
      return null;
    }
  }
}
