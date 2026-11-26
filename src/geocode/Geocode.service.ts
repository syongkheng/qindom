import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ITB_GEOCODE_CACHE } from "../models/databases/tb_geocode_cache.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { NominatimPlaceDto } from "./Geocode.types.js";

const GEOCODE_CACHE_TABLE = "tb_geocode_cache";

const NOMINATIM_SERVICE_NAME = "Nominatim";
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_RESULT_LIMIT = 10;
// Nominatim's usage policy requires an identifying User-Agent with a contact.
const NOMINATIM_HEADERS = {
  "User-Agent": "Awense/1.0 (contact@awense.com)",
  "Accept-Language": "en",
};

// Nominatim's usage policy allows at most 1 req/s. /geocode is public, so cache
// misses from every caller are serialised through this one module-level queue;
// once too many are waiting, new misses fail fast instead of piling up.
// (In-memory: correct only because qindom runs as a single PM2 process.)
const NOMINATIM_MIN_GAP_MS = 1100;
const NOMINATIM_MAX_QUEUED = 5;
let nominatimQueue: Promise<void> = Promise.resolve();
let nominatimQueued = 0;

const waitPolicyGap = () => new Promise<void>((resolve) => setTimeout(resolve, NOMINATIM_MIN_GAP_MS));

export class GeocodeService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Search for places. Served from the DB cache when possible, otherwise fetched
   * from Nominatim (throttled) and cached, including empty results, so repeated
   * misses don't hammer Nominatim. Failed fetches are never cached (there's no TTL).
   */
  async search(query: string, logContext?: IRequestLogContext): Promise<NominatimPlaceDto[]> {
    const normalized = query.trim().toLowerCase();
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Geocode search");

    const cached = await this.getCached(normalized, event);
    if (cached !== null) {
      if (event) event.detail = "cache hit";
      return cached;
    }

    const results = await searchNominatim({
      q: normalized,
      limit: String(NOMINATIM_RESULT_LIMIT),
      // addressdetails=1 so callers can resolve a destination's country
      // (the trip-creation flow uses it to look up per-country note suggestions).
      addressdetails: "1",
    });
    if (results === null) throw new Exceptions.ExternalRequest(NOMINATIM_SERVICE_NAME);

    await this.storeCache(normalized, results, event);
    if (event) event.detail = `cache miss, ${results.length} result(s) from ${NOMINATIM_SERVICE_NAME}`;
    return results;
  }

  // ── Cache (best-effort: a DB failure falls through to Nominatim) ──

  private async getCached(query: string, event?: IRequestLogEvent): Promise<NominatimPlaceDto[] | null> {
    try {
      const records = await this.db.find<ITB_GEOCODE_CACHE>(
        GEOCODE_CACHE_TABLE,
        { query },
        { limit: 1, orderBy: "created_dt", orderDirection: "desc" },
        event,
      );
      if (!records.length) return null;
      return JSON.parse(records[0].results_json) as NominatimPlaceDto[];
    } catch (error) {
      LoggingUtilities.service.warn("GeocodeService.getCached", `Cache read failed: ${toMessage(error)}`);
      return null;
    }
  }

  private async storeCache(query: string, results: NominatimPlaceDto[], event?: IRequestLogEvent): Promise<void> {
    try {
      await this.db.insert<ITB_GEOCODE_CACHE>(
        GEOCODE_CACHE_TABLE,
        { query, results_json: JSON.stringify(results), created_dt: Date.now() },
        event,
      );
    } catch (error) {
      LoggingUtilities.service.error("GeocodeService.storeCache", `Cache write failed: ${toMessage(error)}`);
    }
  }
}

// ── Nominatim (1 req/s queue) ──

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (nominatimQueued >= NOMINATIM_MAX_QUEUED) {
    LoggingUtilities.service.warn("GeocodeService.throttled", `Nominatim queue full (${nominatimQueued}), rejecting`);
    throw new Exceptions.ExternalRequest(NOMINATIM_SERVICE_NAME);
  }
  nominatimQueued++;
  const run = nominatimQueue.then(fn);
  // The next caller starts only after this one finishes (or fails) plus the policy gap.
  nominatimQueue = run.then(waitPolicyGap, waitPolicyGap);
  try {
    return await run;
  } finally {
    nominatimQueued--;
  }
}

/** Returns null on any failure so the caller can refuse to cache it. */
async function fetchNominatim(params: Record<string, string>): Promise<NominatimPlaceDto[] | null> {
  const url = `${NOMINATIM_SEARCH_URL}?${new URLSearchParams({ ...params, format: "json" })}`;
  LoggingUtilities.service.info("GeocodeService.fetchNominatim", `[EXT-GET] ${url}`);

  try {
    const response = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!response.ok) {
      LoggingUtilities.service.error("GeocodeService.fetchNominatim", `Nominatim HTTP ${response.status} for: ${url}`);
      return null;
    }
    return (await response.json()) as NominatimPlaceDto[];
  } catch (error) {
    LoggingUtilities.service.error("GeocodeService.fetchNominatim", `Fetch failed for ${url}: ${toMessage(error)}`);
    return null;
  }
}

/**
 * Nominatim `/search` (uncached) through the module's 1 req/s queue, with the identifying
 * User-Agent the usage policy requires. `format=json` is always set. Returns null when the
 * call fails; throws `ExternalRequest` when too many calls are already waiting.
 */
function searchNominatim(params: Record<string, string>): Promise<NominatimPlaceDto[] | null> {
  return throttled(() => fetchNominatim(params));
}
