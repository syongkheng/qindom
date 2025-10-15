import axios from "axios";
import { parse } from "node-html-parser";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { ITB_HDB_PPHS_COORDINATE } from "../models/databases/tb_hdb_pphs_coordinate";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";

export class CoordinateService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Makes a call to Google Maps to retrieve coordinates for a given address based on the redirection url.
   * @param address 
   * @returns formed_url, lat, lng, and source of data
   */
  async getCoordinatesOfAddress(address: string): Promise<{
    formed_url: string;
    lat: string;
    lng: string;
    source: "database" | "google" | "error";
  }> {
    const transformedAddress = address.replace(/ /g, "+");

    // Check if we already have coordinates for this address in the database
    const existingRecords = await this.db.find<ITB_HDB_PPHS_COORDINATE>(
      "tb_hdb_pphs_coordinate",
      { building: transformedAddress },
      {
        limit: 1,
        orderBy: "created_dt",
        orderDirection: "desc",
        columns: ["formed_url", "lat", "lng"],
      }
    );

    if (existingRecords.length > 0) {
      LoggingUtilities.service.info(
        "CoordinateService.getCoordinatesOfAddress",
        `Found existing coordinates for ${address} in database`
      );
      return {
        formed_url: existingRecords[0].formed_url,
        lat: existingRecords[0].lat,
        lng: existingRecords[0].lng,
        source: "database",
      };
    }

    this.sleep(1000); // Sleep for 1 second to avoid rapid requests

    const requestUrl = `https://www.google.com/maps/search/${transformedAddress}`;

    LoggingUtilities.service.info(
      "CoordinateService.getCoordinatesOfAddress",
      `[EXT-GET] ${requestUrl}`
    );

    // Make GET request to Google to retrieve redirect URL
    const response = await axios
      .get(requestUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
        },
      })
      .catch((error) => {
        LoggingUtilities.service.error(
          "CoordinateService.getCoordinatesOfAddress",
          `Failed to fetch from Google for address: ${address} - ${error.message}`
        );
        return { data: "" }; // Return empty data on error
      });

    const root = parse(response.data);
    const scripts = root.querySelectorAll("script");

    const urlRegex =
      /https?:\/\/www\.google\.com\/maps\/preview\/place\/[^"'\s\\]+/g;

    for (const script of scripts) {
      const scriptContent = script.text;

      const matches = scriptContent.match(urlRegex);
      if (matches && matches.length > 0) {
        const url = matches[0].replace(/\\u003d/g, "=");

        LoggingUtilities.service.debug(
          "CoordinateService.getCoordinatesOfAddress",
          `Formed: ${url}`
        );
        const parts = url.split("/@")[1]?.split(",");
        const retrievedLat = parts ? parts[0] : "";
        const retrievedLng = parts ? parts[1] : "";

        try {
          // Insert DB for future retrieval

          await this.db.insert<ITB_HDB_PPHS_COORDINATE>(
            "tb_hdb_pphs_coordinate",
            {
              building: transformedAddress,
              formed_url: url,
              lat: retrievedLat,
              lng: retrievedLng,
              created_dt: new Date().getTime(),
              created_by: "SYSTEM",
            }
          );
          LoggingUtilities.service.info(
            "CoordinateService.getCoordinatesOfAddress",
            `Sucessfully stored coordinates for ${address} in database`
          );
        } catch (error) {
          LoggingUtilities.service.error(
            "CoordinateService.getCoordinatesOfAddress",
            `Failed to store coordinates for ${address} in database`
          );
        }

        return {
          formed_url: url,
          lat: retrievedLat,
          lng: retrievedLng,
          source: "google",
        };
      }
    }

    // Fallback response
    return { source: "error", formed_url: "", lat: "", lng: "" };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
