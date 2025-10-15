import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

interface BusTimingRecord {
  ServiceNo: string;
  Operator: string;
  NextBus: NextBusRecord;
  NextBus2: NextBusRecord;
  NextBus3: NextBusRecord;
}

interface NextBusRecord {
  OriginCode: string;
  DestinationCode: string;
  EstimatedArrival: string;
  Monitored: number;
  Latitude: string;
  Longitude: string;
  VisitNumber: number;
  Load: string;
  Feature: string;
  Type: string;
}

export class LtaService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Makes a call to LTA DataMall to retrieve bus arrival timings for a specific bus stop code.
   * @param busStopCode
   * @returns Array of bus timing records and source of data
   */
  async statistics(busStopCode: string): Promise<{
    records: BusTimingRecord[];
    source: "website";
  }> {
    const apiKey = process.env.LTA_DATAMALL_API_KEY;
    if (!apiKey) {
      LoggingUtilities.service.error(
        "lta_service",
        "LTA_DATAMALL_API_KEY is not set in environment variables"
      );
      throw new Error("LTA API key not configured");
    }

    try {
      LoggingUtilities.service.debug(
        "lta_service",
        `busStopCode: ${busStopCode}`
      );
      const response = await fetch(
        `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=${busStopCode}`,
        {
          method: "GET",
          headers: {
            AccountKey: apiKey,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        LoggingUtilities.service.error(
          "lta_service",
          `LTA API request failed with status ${response.status}`
        );
        throw new Error(
          `LTA API request failed with status ${response.status}`
        );
      }

      const data = await response.json();

      return {
        records: data.Services as BusTimingRecord[],
        source: "website",
      };
    } catch (error: any) {
      LoggingUtilities.service.error(
        "lta_service",
        `Error fetching LTA data: ${error.message}`
      );
    }
    throw new Error("Failed to fetch LTA data");
  }
}
