import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { ITB_GEOCODE_CACHE } from "../models/databases/tb_geocode_cache";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { toMessage } from "../utils/errorUtils";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS = {
  "User-Agent": "Awense/1.0 (contact@awense.com)",
  "Accept-Language": "en",
};

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

    // 2️⃣ Fetch from Nominatim
    const results = await this.fetchNominatim(normalized);

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

  private async fetchNominatim(query: string): Promise<Record<string, unknown>[]> {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=0`;
    LoggingUtilities.service.info("GeocodeService.fetchNominatim", `[EXT-GET] ${url}`);

    try {
      const response = await fetch(url, { headers: NOMINATIM_HEADERS });
      if (!response.ok) {
        LoggingUtilities.service.error("GeocodeService.fetchNominatim", `Nominatim HTTP ${response.status} for: ${query}`);
        return [];
      }
      return (await response.json()) as Record<string, unknown>[];
    } catch (error) {
      LoggingUtilities.service.error("GeocodeService.fetchNominatim", `Fetch failed for ${query}: ${toMessage(error)}`);
      return [];
    }
  }
}
