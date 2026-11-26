import { Exceptions } from "../exceptions/AppExceptions.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITB_LTA_BUS_INFO } from "../models/databases/tb_lta_bus_info.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import {
  BusArrivalServiceDto,
  BusArrivalsDto,
  BusServiceDto,
  BusServicesDto,
  NearbyBusStopRow,
  NearbyBusStopsResult,
  NearestMrtStationRow,
  NearestMrtStationsResult,
} from "./Lta.types.js";

const LTA_BUS_STOP_TABLE = "tb_lta_busstop";
const LTA_BUS_INFO_TABLE = "tb_lta_bus_info";
const LRT_MRT_STATION_TABLE = "tb_lrt_mrt_station";

const DATAMALL_SERVICE_NAME = "LTA DataMall";
const DATAMALL_BUS_ARRIVAL_URL = "https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival";

/** /hdb/pphs/busstops returns at most this many stops (nearest first); `count` is still the full total. */
export const NEARBY_BUS_STOPS_MAX_ROWS = 10;

type BusInfoRow = Omit<ITB_LTA_BUS_INFO, "id" | "busstop_code" | "created_dt" | "created_by">;

/** Read lazily, on call (see config/README.md). Missing key = our misconfiguration (500). */
function getDataMallApiKey(): string {
  const apiKey = process.env.LTA_DATAMALL_API_KEY;
  if (!apiKey) {
    LoggingUtilities.service.error("LtaService.getDataMallApiKey", "LTA_DATAMALL_API_KEY is not set");
    throw new Exceptions.Unknown();
  }
  return apiKey;
}

export function toBusServiceDto(row: BusInfoRow): BusServiceDto {
  return {
    serviceNo: row.service_no,
    operator: row.operator,
    direction: row.direction,
    stopSequence: row.stop_sequence,
    distance: row.distance,
    weekdayFirstBus: row.wd_first_bus,
    weekdayLastBus: row.wd_last_bus,
    saturdayFirstBus: row.sat_first_bus,
    saturdayLastBus: row.sat_last_bus,
    sundayFirstBus: row.sun_first_bus,
    sundayLastBus: row.sun_last_bus,
  };
}

/** Owns the LTA tables (`tb_lta_busstop`, `tb_lta_bus_info`, `tb_lrt_mrt_station`) and the DataMall call. */
export class LtaService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Live arrivals at a stop, straight from LTA DataMall. A network error, non-OK
   * status or unreadable body is a 502 (`ExternalRequest`).
   */
  async getBusArrivals(busStopCode: string, logContext?: IRequestLogContext): Promise<BusArrivalsDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "LTA bus arrivals");
    const apiKey = getDataMallApiKey();
    const url = `${DATAMALL_BUS_ARRIVAL_URL}?${new URLSearchParams({ BusStopCode: busStopCode })}`;

    let services: BusArrivalServiceDto[];
    try {
      const response = await fetch(url, { headers: { AccountKey: apiKey, Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { Services?: BusArrivalServiceDto[] };
      services = data.Services ?? [];
    } catch (error) {
      LoggingUtilities.service.error(
        "LtaService.getBusArrivals",
        `${DATAMALL_SERVICE_NAME} failed: ${toMessage(error)}`,
      );
      throw new Exceptions.ExternalRequest(DATAMALL_SERVICE_NAME);
    }

    if (event) event.detail = `${services.length} service(s) at ${busStopCode}`;
    return { records: services };
  }

  /** Bus services that call at a stop, ordered by service number (numeric first, then suffix: 13, 13A, 50). */
  async listBusServices(busStopCode: string, logContext?: IRequestLogContext): Promise<BusServicesDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "LTA bus services");
    const rows = await this.db.raw<BusInfoRow[]>(
      `SELECT service_no, operator, direction, stop_sequence, distance,
              wd_first_bus, wd_last_bus, sat_first_bus, sat_last_bus, sun_first_bus, sun_last_bus
       FROM ${LTA_BUS_INFO_TABLE}
       WHERE busstop_code = ?
       ORDER BY CAST(service_no AS UNSIGNED), service_no`,
      [busStopCode],
      event,
    );
    if (event) event.detail = `${rows.length} service(s)`;
    return { services: rows.map(toBusServiceDto), count: rows.length };
  }

  /** Bus stops within `radiusM` metres of a point, nearest first (capped at `NEARBY_BUS_STOPS_MAX_ROWS`). */
  async findBusStopsNear(
    lat: number,
    lng: number,
    radiusM: number,
    logContext?: IRequestLogContext,
  ): Promise<NearbyBusStopsResult> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "LTA bus stops near point");
    const rows = await this.db.raw<NearbyBusStopRow[]>(
      `SELECT b.busstop_code, b.road_name, b.desc,
              ST_Distance_Sphere(POINT(b.lng, b.lat), POINT(?, ?)) AS distance_m
       FROM ${LTA_BUS_STOP_TABLE} b
       WHERE ST_Distance_Sphere(POINT(b.lng, b.lat), POINT(?, ?)) <= ?
       ORDER BY distance_m ASC`,
      [lng, lat, lng, lat, radiusM],
      event,
    );
    if (event) event.detail = `${rows.length} stop(s) within ${radiusM} m`;
    return { rows: rows.slice(0, NEARBY_BUS_STOPS_MAX_ROWS), count: rows.length };
  }

  /** The `limit` nearest MRT/LRT stations to a point (one row per station, using its closest exit). */
  async findNearestMrtStations(
    lat: number,
    lng: number,
    limit: number,
    logContext?: IRequestLogContext,
  ): Promise<NearestMrtStationsResult> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "LTA nearest MRT stations");
    // NOT a typo: tb_lrt_mrt_station stores latitude in `lng` and longitude in `lat`
    // (swapped at import). POINT(e.lat, e.lng) is therefore POINT(longitude, latitude),
    // matching POINT(b.lng, b.lat) for bus stops. Don't "fix" one without the other.
    const rows = await this.db.raw<NearestMrtStationRow[]>(
      `SELECT e.station, e.type,
              MIN(ST_Distance_Sphere(POINT(e.lat, e.lng), POINT(?, ?))) AS distance_m
       FROM ${LRT_MRT_STATION_TABLE} e
       GROUP BY e.station, e.type
       ORDER BY distance_m ASC
       LIMIT ?`,
      [lng, lat, limit],
      event,
    );
    if (event) event.detail = `${rows.length} station(s)`;
    return { rows, count: rows.length };
  }
}
