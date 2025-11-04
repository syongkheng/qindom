import { UnknownException } from "../exceptions/UnknownException";
import { ITB_LTA_BUS_INFO } from "../models/databases/tb_lta_bus_info";
import { ITB_LTA_BUSSTOP } from "../models/databases/tb_lta_busstop";
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
  ServiceNo: string;
  Operator: string;
  Direction: string;
  StopSequence: string;
  BusStopCode: string;
  Distance: string;
  WD_FirstBus: string;
  WD_LastBus: string;
  SAT_FirstBus: string;
  SAT_LastBus: string;
  SUN_FirstBus: string;
  SUN_LastBus: string;
}

interface LtaBusInfoRecord {}

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
        "LtaService.statistics",
        "LTA_DATAMALL_API_KEY is not set in environment variables"
      );
      throw new Error("LTA API key not configured");
    }

    try {
      LoggingUtilities.service.debug(
        "LtaService.statistics",
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
          "LtaService.statistics",
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
        "LtaService.statistics",
        `Error fetching LTA data: ${error.message}`
      );
    }
    throw new Error("Failed to fetch LTA data");
  }

  async retrieveBusServicesByBusStopCode(busStopCode: string) {
    try {
      return await this.db.lta.findBusServicesByBusStopCode(busStopCode);
    } catch (error) {
      throw new UnknownException();
    }
  }

  // async _retrieveAllBusstops(): Promise<{ totalCount: number }> {
  //   const apiKey = process.env.LTA_DATAMALL_API_KEY;

  //   if (!apiKey) {
  //     LoggingUtilities.service.error(
  //       "LtaService._retrieveAllBusstops",
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
  //     LoggingUtilities.service.debug("LtaService._retrieveAllBusstops", `Fetching: ${url}`);

  //     const response = await fetch(url, { headers });

  //     if (!response.ok) {
  //       throw new Error(
  //         `Failed to fetch data: ${response.status} ${response.statusText}`
  //       );
  //     }

  //     const data = await response.json();

  //     if (!data.value || data.value.length === 0) {
  //       LoggingUtilities.service.info(
  //         "LtaService._retrieveAllBusstops",
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
  //         "LtaService._retrieveAllBusstops",
  //         `Insert batch failed at skip=${skip}: ${err.message}`
  //       );
  //     }

  //     totalCount += data.value.length;
  //     LoggingUtilities.service.info(
  //       "LtaService._retrieveAllBusstops",
  //       `Inserted ${data.value.length} bus stops (total so far: ${totalCount})`
  //     );

  //     skip += pageSize; // Move to the next batch
  //   }

  //   LoggingUtilities.service.info(
  //     "LtaService._retrieveAllBusstops",
  //     `Completed fetching all bus stops. Total: ${totalCount}`
  //   );

  //   return {
  //     totalCount,
  //   };
  // }

  // async _retrieveAllBusInformation(): Promise<{ totalCount: number }> {
  //   const apiKey = process.env.LTA_DATAMALL_API_KEY;

  //   if (!apiKey) {
  //     LoggingUtilities.service.error(
  //       "LtaService._retrieveAllBusInformation",
  //       "LTA_DATAMALL_API_KEY is not set in environment variables"
  //     );
  //     throw new Error("LTA API key not configured");
  //   }

  //   const baseUrl =
  //     "https://datamall2.mytransport.sg/ltaodataservice/BusRoutes";

  //   const headers = {
  //     AccountKey: apiKey,
  //     Accept: "application/json",
  //   };

  //   let skip = 0;
  //   let totalCount = 0;
  //   const pageSize = 500;

  //   while (true) {
  //     const url = `${baseUrl}?$skip=${skip}`;
  //     LoggingUtilities.service.debug(
  //       "LtaService._retrieveAllBusInformation",
  //       `Fetching: ${url}`
  //     );

  //     const response = await fetch(url, { headers });

  //     if (!response.ok) {
  //       throw new Error(
  //         `Failed to fetch data: ${response.status} ${response.statusText}`
  //       );
  //     }

  //     const data = await response.json();

  //     if (!data.value || data.value.length === 0) {
  //       LoggingUtilities.service.info(
  //         "LtaService._retrieveAllBusInformation",
  //         "No more bus route information to fetch"
  //       );
  //       break; // Stop when no more results
  //     }

  //     // Optional: batch insert using transaction for better performance
  //     try {
  //       await this.db.transaction(async (trx) => {
  //         for (const busService of data.value as LtaBusstopRecord[]) {
  //           await this.db.insert.call({ knex: trx }, "tb_lta_bus_info", {
  //             service_no: busService.ServiceNo,
  //             operator: busService.Operator,
  //             direction: busService.Direction,
  //             stop_sequence: busService.StopSequence,
  //             busstop_code: busService.BusStopCode,
  //             distance: busService.Distance,
  //             wd_first_bus: busService.WD_FirstBus,
  //             wd_last_bus: busService.WD_LastBus,
  //             sat_first_bus: busService.SAT_FirstBus,
  //             sat_last_bus: busService.SAT_LastBus,
  //             sun_first_bus: busService.SUN_FirstBus,
  //             sun_last_bus: busService.SUN_LastBus,
  //             created_dt: new Date().getTime(),
  //             created_by: "SYSTEM",
  //           });
  //         }
  //       });
  //     } catch (err: any) {
  //       LoggingUtilities.service.error(
  //         "LtaService._retrieveAllBusInformation",
  //         `Insert batch failed at skip=${skip}: ${err.message}`
  //       );
  //     }

  //     totalCount += data.value.length;
  //     LoggingUtilities.service.info(
  //       "LtaService._retrieveAllBusInformation",
  //       `Inserted ${data.value.length} bus route information (total so far: ${totalCount})`
  //     );

  //     skip += pageSize; // Move to the next batch
  //   }

  //   LoggingUtilities.service.info(
  //     "LtaService._retrieveAllBusInformation",
  //     `Completed fetching all bus route information. Total: ${totalCount}`
  //   );

  //   return {
  //     totalCount,
  //   };
  // }
}
