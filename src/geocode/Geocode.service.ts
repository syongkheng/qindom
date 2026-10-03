import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ITB_GEOCODE_CACHE } from "../models/databases/tb_geocode_cache.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { toMessage } from "../utils/errorUtils.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS = {
  "User-Agent": "Awense/1.0 (contact@awense.com)",
  "Accept-Language": "en",
};

// Nominatim's usage policy allows at most 1 req/s. /geocode is public, so cache
// misses from every caller are serialised through this one module-level queue;
// once too many are waiting, new misses fail fast instead of piling up.
const NOMINATIM_MIN_GAP_MS = 1100;
const NOMINATIM_MAX_QUEUED = 5;
let nominatimQueue: Promise<void> = Promise.resolve();
let nominatimQueued = 0;

export class GeocodeService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Search for places by query string.
   * Returns cached Nominatim results from DB, or fetches from Nominatim and caches.
   */
  async search(query: string): Promise<Record<string, unknown>[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    // 1️⃣ DB cache
    const cached = await this.getCached(normalized);
    if (cached !== null) return cached;

    // 2️⃣ Fetch from Nominatim (throttled — see NOMINATIM_MIN_GAP_MS)
    const results = await this.throttled(() => this.fetchNominatim(normalized));
    // Failed fetch — don't cache, or a transient error would stick forever (no TTL)
    if (results === null) throw new Exceptions.ExternalRequest("Nominatim");

    // 3️⃣ Store in cache (even empty results, to prevent hammering)
    await this.storeCache(normalized, results);

    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // Cache
  // ─────────────────────────────────────────────────────────────

  private async getCached(query: string): Promise<Record<string, unknown>[] | null> {
    try {
      const records = await this.db.find<ITB_GEOCODE_CACHE>(
        "tb_geocode_cache",
        { query },
        { limit: 1, orderBy: "created_dt", orderDirection: "desc" }
      );

      if (!records.length) return null;

      LoggingUtilities.service.info("GeocodeService.getCached", `Cache hit for: ${query}`);
      return JSON.parse(records[0].results_json) as Record<string, unknown>[];
    } catch (error) {
      LoggingUtilities.service.warn("GeocodeService.getCached", `Cache read failed: ${toMessage(error)}`);
      return null;
    }
  }

  private async storeCache(query: string, results: Record<string, unknown>[]): Promise<void> {
    try {
      await this.db.insert<ITB_GEOCODE_CACHE>("tb_geocode_cache", {
        query,
        results_json: JSON.stringify(results),
        created_dt: Date.now(),
      });
      LoggingUtilities.service.info("GeocodeService.storeCache", `Cached ${results.length} result(s) for: ${query}`);
    } catch (error) {
      LoggingUtilities.service.error("GeocodeService.storeCache", `Cache write failed: ${toMessage(error)}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Nominatim fetch
  // ─────────────────────────────────────────────────────────────

  private async throttled<T>(fn: () => Promise<T>): Promise<T> {
    if (nominatimQueued >= NOMINATIM_MAX_QUEUED) {
      LoggingUtilities.service.warn("GeocodeService.throttled", `Nominatim queue full (${nominatimQueued}), rejecting`);
      throw new Exceptions.ExternalRequest("Nominatim");
    }
    nominatimQueued++;
    const run = nominatimQueue.then(fn);
    // Next caller starts only after this one finishes plus the policy gap
    nominatimQueue = run.then(
      () => new Promise((r) => setTimeout(r, NOMINATIM_MIN_GAP_MS)),
      () => new Promise((r) => setTimeout(r, NOMINATIM_MIN_GAP_MS)),
    );
    try {
      return await run;
    } finally {
      nominatimQueued--;
    }
  }

  private async fetchNominatim(query: string): Promise<Record<string, unknown>[] | null> {
    // addressdetails=1 so callers can resolve a destination's country (e.g.
    // the trip-creation flow needs it to look up per-country note suggestions).
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1`;
    LoggingUtilities.service.info("GeocodeService.fetchNominatim", `[EXT-GET] ${url}`);

    try {
      const response = await fetch(url, { headers: NOMINATIM_HEADERS });
      if (!response.ok) {
        LoggingUtilities.service.error("GeocodeService.fetchNominatim", `Nominatim HTTP ${response.status} for: ${query}`);
        return null;
      }
      return (await response.json()) as Record<string, unknown>[];
    } catch (error) {
      LoggingUtilities.service.error("GeocodeService.fetchNominatim", `Fetch failed for ${query}: ${toMessage(error)}`);
      return null;
    }
  }
}
