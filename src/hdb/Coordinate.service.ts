import { parse } from "node-html-parser";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { ITB_HDB_PPHS_COORDINATE } from "../models/databases/tb_hdb_pphs_coordinate";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { Exceptions } from "../exceptions/AppExceptions";
import { CoordinateUtilities } from "../utils/CoordinateUtilities";
import { toMessage } from "../utils/errorUtils";

type CoordinateSource = "database" | "google" | "error" | "unparseable";

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

export class CoordinateService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Retrieves coordinates for an address.
   * Uses DB cache first, otherwise scrapes Google Maps HTML.
   */
  async getCoordinatesOfAddress(address: string): Promise<CoordinateResult> {
    // 1️⃣ DB cache
    const cached = await this.getCachedCoordinates(address);
    if (cached) return cached;

    // 2️⃣ Validation
    const unparseable = await this.handleUnparseableAddress(address);
    if (unparseable) return unparseable;

    await this.sleep(1000); // Rate limiting

    const requestUrl = this.buildGoogleMapsUrl(address);

    // 3️⃣ Fetch HTML
    const html = await this.fetchGoogleMapsHtml(requestUrl, address);
    if (!html) return this.errorResult();

    // 4️⃣ Parse HTML
    const coordinates = this.parseCoordinatesFromHtml(html, requestUrl);
    if (!coordinates) {
      this.logNoCoordinates(address);
      return this.errorResult();
    }

    // 5️⃣ Persist
    await this.storeCoordinates(address, coordinates);

    return { ...coordinates, source: "google" };
  }

  // ─────────────────────────────────────────────────────────────
  // Cache
  // ─────────────────────────────────────────────────────────────

  /**
   * Attempts to retrieve coordinates from the database cache.
   */
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
    LoggingUtilities.service.info("CoordinateService.getCachedCoordinates", `Found cached coordinates for ${address}`);

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

  /**
   * Handles addresses that are known to be unparseable.
   */
  private async handleUnparseableAddress(address: string): Promise<CoordinateResult | null> {
    if (!address.includes("&")) return null;

    LoggingUtilities.service.warn("CoordinateService.handleUnparseableAddress", `Address contains '&': ${address}`);

    await this.db.insert<ITB_HDB_PPHS_COORDINATE>("tb_hdb_pphs_coordinate", {
      building: address,
      formed_url: this.buildGoogleMapsUrl(address),
      lat: "",
      lng: "",
      created_dt: Date.now(),
      created_by: "SYSTEM",
    });

    return { formed_url: "", lat: "", lng: "", source: "unparseable" };
  }

  // ─────────────────────────────────────────────────────────────
  // External Fetch
  // ─────────────────────────────────────────────────────────────

  /**
   * Builds a Google Maps place URL.
   */
  private buildGoogleMapsUrl(address: string): string {
    return `https://www.google.com/maps/place/${address}`;
  }

  /**
   * Fetches Google Maps HTML for an address.
   */
  private async fetchGoogleMapsHtml(url: string, address: string): Promise<string | null> {
    LoggingUtilities.service.info("CoordinateService.fetchGoogleMapsHtml", `[EXT-GET] ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
        },
      });

      if (!response.ok) {
        throw new Exceptions.ExternalRequest("Google Maps");
      }

      return await response.text();
    } catch (error) {
      LoggingUtilities.service.error(
        "CoordinateService.fetchGoogleMapsHtml",
        `Fetch failed for ${address}: ${toMessage(error)}`
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Parsing
  // ─────────────────────────────────────────────────────────────

  /**
   * Extracts coordinates using all supported parsing strategies.
   */
  private parseCoordinatesFromHtml(html: string, requestUrl: string): Coordinates | null {
    const root = parse(html);
    const scripts = root.querySelectorAll("script");

    for (const script of scripts) {
      const text = script.text;

      return this.parseFromPreviewUrl(text, requestUrl) ?? this.parseFromAppInitializationState(text, requestUrl);
    }

    return null;
  }

  /**
   * Strategy 1: Extract from Google Maps preview URL.
   */
  private parseFromPreviewUrl(scriptText: string, requestUrl: string): Coordinates | null {
    const regex = /https?:\/\/www\.google\.com\/maps\/preview\/place\/[^"'\s\\]+/g;
    const matches = scriptText.match(regex);

    if (!matches?.length) return null;

    const url = matches[0].replace(/\\u003d/g, "=");
    const parts = url.split("/@")[1]?.split(",");

    if (!parts || parts.length < 2) return null;

    return {
      formed_url: requestUrl,
      lat: parts[0],
      lng: parts[1],
    };
  }

  /**
   * Strategy 2: Extract from APP_INITIALIZATION_STATE.
   */
  private parseFromAppInitializationState(scriptText: string, requestUrl: string): Coordinates | null {
    const regex = /window\.APP_INITIALIZATION_STATE=([^;]+);/;
    const match = scriptText.match(regex);

    if (!match) return null;

    try {
      const parsed = JSON.parse(match[1]);
      const lat = CoordinateUtilities.formatCoord(parsed?.[0]?.[0]?.[2]);
      const lng = CoordinateUtilities.formatCoord(parsed?.[0]?.[0]?.[1]);

      if (!lat || !lng) return null;

      return {
        formed_url: requestUrl,
        lat: String(lat),
        lng: String(lng),
      };
    } catch {
      throw new Exceptions.ParseJsonException("Google Maps response");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────

  /**
   * Stores coordinates in the database.
   */
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
      LoggingUtilities.service.error(
        "CoordinateService.storeCoordinates",
        `DB insert failed for ${address}: ${toMessage(error)}`
      );
    }
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
      LoggingUtilities.service.error(
        "CoordinateService.updateCoordinates",
        `DB update failed for ${address}: ${toMessage(error)}`
      );
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
    LoggingUtilities.service.warn("CoordinateService.getCoordinatesOfAddress", `No coordinates found for ${address}`);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async replaceWhitespaceWithPlus(address: string): Promise<string> {
    return address.replace(/\s+/g, "+");
  }
}
