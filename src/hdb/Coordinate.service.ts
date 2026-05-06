import { LoggingUtilities } from "../utils/LoggingUtilities";
import { ITB_HDB_PPHS_COORDINATE } from "../models/databases/tb_hdb_pphs_coordinate";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { toMessage } from "../utils/errorUtils";

type CoordinateSource = "database" | "onemap" | "nominatim" | "error" | "unparseable";

interface CoordinateResult {
  formed_url: string;
  lat: string;
  lng: string;
  source: CoordinateSource;
}

interface Coordinates {
  formed_url: string;
  lat: string;
  lng: string;
}

interface OneMapResponse {
  found: number;
  results: Array<{ LATITUDE: string; LONGITUDE: string }>;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

export class CoordinateService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Retrieves coordinates for an address.
   * Uses DB cache first, then OneMap (SLA), then Nominatim (OSM) as fallback.
   */
  async getCoordinatesOfAddress(address: string): Promise<CoordinateResult> {
    // 1️⃣ DB cache
    const cached = await this.getCachedCoordinates(address);
    if (cached) return cached;

    // 2️⃣ Skip multi-block addresses (e.g. "Blk 36, 43 & 44 Tanglin Halt Road")
    const unparseable = await this.handleUnparseableAddress(address);
    if (unparseable) return unparseable;

    // address arrives with + for spaces — decode before passing to APIs
    const decoded = address.replace(/\+/g, " ");

    // 3️⃣ OneMap (primary — official SLA geocoder, Singapore-specific, no auth needed)
    await this.sleep(300);
    const oneMap = await this.fetchOneMapCoordinates(decoded);
    if (oneMap) {
      await this.storeCoordinates(address, oneMap);
      return { ...oneMap, source: "onemap" };
    }

    // 4️⃣ Nominatim / OpenStreetMap (fallback — free, no auth, 1 req/s policy)
    await this.sleep(1000);
    const nominatim = await this.fetchNominatimCoordinates(decoded);
    if (nominatim) {
      await this.storeCoordinates(address, nominatim);
      return { ...nominatim, source: "nominatim" };
    }

    this.logNoCoordinates(address);
    return this.errorResult();
  }

  // ─────────────────────────────────────────────────────────────
  // Geocoding sources
  // ─────────────────────────────────────────────────────────────

  /**
   * OneMap Search API — Singapore Land Authority.
   * Docs: https://www.onemap.gov.sg/apidocs/apidocs/#search
   * No authentication required.
   */
  private async fetchOneMapCoordinates(address: string): Promise<Coordinates | null> {
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(address)}&returnGeom=Y&getAddrDetails=N&pageNum=1`;
    LoggingUtilities.service.info("CoordinateService.fetchOneMapCoordinates", `[EXT-GET] ${url}`);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "fndom-server/1.0" },
      });

      if (!response.ok) {
        LoggingUtilities.service.warn("CoordinateService.fetchOneMapCoordinates", `HTTP ${response.status} for ${address}`);
        return null;
      }

      const data = (await response.json()) as OneMapResponse;

      if (!data.found || !data.results?.length) {
        LoggingUtilities.service.warn("CoordinateService.fetchOneMapCoordinates", `No results for: ${address}`);
        return null;
      }

      const { LATITUDE, LONGITUDE } = data.results[0];
      if (!LATITUDE || !LONGITUDE) return null;

      return {
        formed_url: `https://www.google.com/maps?q=${LATITUDE},${LONGITUDE}`,
        lat: LATITUDE,
        lng: LONGITUDE,
      };
    } catch (error) {
      LoggingUtilities.service.error("CoordinateService.fetchOneMapCoordinates", `Failed for ${address}: ${toMessage(error)}`);
      return null;
    }
  }

  /**
   * Nominatim / OpenStreetMap — free geocoder, no auth required.
   * Policy: max 1 req/s, meaningful User-Agent required.
   */
  private async fetchNominatimCoordinates(address: string): Promise<Coordinates | null> {
    const query = `${address} Singapore`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=sg&limit=1`;
    LoggingUtilities.service.info("CoordinateService.fetchNominatimCoordinates", `[EXT-GET] ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "fndom-server/1.0",
          "Accept-Language": "en",
        },
      });

      if (!response.ok) {
        LoggingUtilities.service.warn("CoordinateService.fetchNominatimCoordinates", `HTTP ${response.status} for ${address}`);
        return null;
      }

      const results = (await response.json()) as NominatimResult[];

      if (!results?.length) {
        LoggingUtilities.service.warn("CoordinateService.fetchNominatimCoordinates", `No results for: ${address}`);
        return null;
      }

      const { lat, lon } = results[0];
      if (!lat || !lon) return null;

      return {
        formed_url: `https://www.google.com/maps?q=${lat},${lon}`,
        lat,
        lng: lon,
      };
    } catch (error) {
      LoggingUtilities.service.error("CoordinateService.fetchNominatimCoordinates", `Failed for ${address}: ${toMessage(error)}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Cache
  // ─────────────────────────────────────────────────────────────

  private async getCachedCoordinates(address: string): Promise<CoordinateResult | null> {
    const records = await this.db.find<ITB_HDB_PPHS_COORDINATE>(
      "tb_hdb_pphs_coordinate",
      { building: address },
      {
        limit: 1,
        orderBy: "created_dt",
        orderDirection: "desc",
        columns: ["formed_url", "lat", "lng"],
      }
    );

    if (!records.length) return null;

    const record = records[0];
    LoggingUtilities.service.info("CoordinateService.getCachedCoordinates", `Cache hit for ${address}`);

    if (!record.lat || !record.lng) {
      return { formed_url: "", lat: "", lng: "", source: "unparseable" };
    }

    return {
      formed_url: record.formed_url,
      lat: record.lat,
      lng: record.lng,
      source: "database",
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────

  private async handleUnparseableAddress(address: string): Promise<CoordinateResult | null> {
    if (!address.includes("&")) return null;

    LoggingUtilities.service.warn("CoordinateService.handleUnparseableAddress", `Multi-block address skipped: ${address}`);

    await this.db.insert<ITB_HDB_PPHS_COORDINATE>("tb_hdb_pphs_coordinate", {
      building: address,
      formed_url: "",
      lat: "",
      lng: "",
      created_dt: Date.now(),
      created_by: "SYSTEM",
    });

    return { formed_url: "", lat: "", lng: "", source: "unparseable" };
  }

  // ─────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────

  private async storeCoordinates(address: string, coordinates: Coordinates): Promise<void> {
    try {
      await this.db.insert<ITB_HDB_PPHS_COORDINATE>("tb_hdb_pphs_coordinate", {
        building: address,
        formed_url: coordinates.formed_url,
        lat: coordinates.lat,
        lng: coordinates.lng,
        created_dt: Date.now(),
        created_by: "SYSTEM",
      });

      LoggingUtilities.service.info("CoordinateService.storeCoordinates", `Stored coordinates for ${address}`);
    } catch (error) {
      LoggingUtilities.service.error("CoordinateService.storeCoordinates", `DB insert failed for ${address}: ${toMessage(error)}`);
    }
  }

  async fetchAllCoordinateOptions(address: string): Promise<Array<{
    source: 'onemap' | 'nominatim';
    lat: string;
    lng: string;
    formedUrl: string;
  }>> {
    const decoded = address.replace(/\+/g, " ");
    const [oneMap, nominatim] = await Promise.all([
      this.fetchOneMapCoordinates(decoded).catch(() => null),
      this.fetchNominatimCoordinates(decoded).catch(() => null),
    ]);
    const results: Array<{ source: 'onemap' | 'nominatim'; lat: string; lng: string; formedUrl: string }> = [];
    if (oneMap) results.push({ source: 'onemap', lat: oneMap.lat, lng: oneMap.lng, formedUrl: oneMap.formed_url });
    if (nominatim) results.push({ source: 'nominatim', lat: nominatim.lat, lng: nominatim.lng, formedUrl: nominatim.formed_url });
    return results;
  }

  async clearCoordinates(address: string): Promise<void> {
    await this.deleteCache(address);
    await this.db.insert<ITB_HDB_PPHS_COORDINATE>("tb_hdb_pphs_coordinate", {
      building: address,
      formed_url: "",
      lat: "",
      lng: "",
      created_dt: Date.now(),
      created_by: "SYSTEM",
    });
    LoggingUtilities.service.info("CoordinateService.clearCoordinates", `Coordinates cleared for ${address}`);
  }

  async deleteCache(address: string): Promise<void> {
    await this.db.delete<ITB_HDB_PPHS_COORDINATE>("tb_hdb_pphs_coordinate", { building: address });
    LoggingUtilities.service.info("CoordinateService.deleteCache", `Cache cleared for ${address}`);
  }

  async updateCoordinates(address: string, coordinates: Coordinates, username: string): Promise<boolean> {
    try {
      const transformedAddress = await this.replaceWhitespaceWithPlus(address);
      await this.db.update<ITB_HDB_PPHS_COORDINATE>(
        "tb_hdb_pphs_coordinate",
        { building: transformedAddress },
        {
          formed_url: coordinates.formed_url,
          lat: coordinates.lat,
          lng: coordinates.lng,
          modified_dt: Date.now(),
          modified_by: username,
        }
      );

      LoggingUtilities.service.info("CoordinateService.updateCoordinates", `Updated coordinates for ${address}`);
      return true;
    } catch (error) {
      LoggingUtilities.service.error("CoordinateService.updateCoordinates", `DB update failed for ${address}: ${toMessage(error)}`);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private errorResult(): CoordinateResult {
    return { formed_url: "", lat: "", lng: "", source: "error" };
  }

  private logNoCoordinates(address: string): void {
    LoggingUtilities.service.warn("CoordinateService.getCoordinatesOfAddress", `No coordinates resolved for: ${address}`);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async replaceWhitespaceWithPlus(address: string): Promise<string> {
    return address.replace(/\s+/g, "+");
  }
}
