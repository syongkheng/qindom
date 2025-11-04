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

interface LtaBusstopRecord {
  BusStopCode: string;
  RoadName: string;
  Description: string;
  Latitude: string;
  Longitude: string;
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

  // async _retrieveAllBusstops(): Promise<{ totalCount: number }> {
  //   const apiKey = process.env.LTA_DATAMALL_API_KEY;

  //   if (!apiKey) {
  //     LoggingUtilities.service.error(
  //       "lta_service",
  //       "LTA_DATAMALL_API_KEY is not set in environment variables"
  //     );
  //     throw new Error("LTA API key not configured");
  //   }

  //   const baseUrl = "https://datamall2.mytransport.sg/ltaodataservice/BusStops";

  //   const headers = {
  //     AccountKey: apiKey,
  //     Accept: "application/json",
  //   };

  //   let skip = 0;
  //   let totalCount = 0;
  //   const pageSize = 500;

  //   while (true) {
  //     const url = `${baseUrl}?$skip=${skip}`;
  //     LoggingUtilities.service.debug("lta_service", `Fetching: ${url}`);

  //     const response = await fetch(url, { headers });

  //     if (!response.ok) {
  //       throw new Error(
  //         `Failed to fetch data: ${response.status} ${response.statusText}`
  //       );
  //     }

  //     const data = await response.json();

  //     if (!data.value || data.value.length === 0) {
  //       LoggingUtilities.service.info(
  //         "lta_service",
  //         "No more bus stops to fetch"
  //       );
  //       break; // Stop when no more results
  //     }

  //     // Optional: batch insert using transaction for better performance
  //     try {
  //       await this.db.transaction(async (trx) => {
  //         for (const busStop of data.value as LtaBusstopRecord[]) {
  //           await this.db.insert.call({ knex: trx }, "tb_lta_busstop", {
  //             busstop_code: busStop.BusStopCode,
  //             road_name: busStop.RoadName,
  //             desc: busStop.Description,
  //             lat: busStop.Latitude,
  //             lng: busStop.Longitude,
  //             created_dt: new Date().getTime(),
  //             created_by: "SYSTEM",
  //           });
  //         }
  //       });
  //     } catch (err: any) {
  //       LoggingUtilities.service.error(
  //         "lta_service",
  //         `Insert batch failed at skip=${skip}: ${err.message}`
  //       );
  //     }

  //     totalCount += data.value.length;
  //     LoggingUtilities.service.info(
  //       "lta_service",
  //       `Inserted ${data.value.length} bus stops (total so far: ${totalCount})`
  //     );

  //     skip += pageSize; // Move to the next batch
  //   }

  //   LoggingUtilities.service.info(
  //     "lta_service",
  //     `Completed fetching all bus stops. Total: ${totalCount}`
  //   );

  //   return {
  //     totalCount,
  //   };
  // }
}
