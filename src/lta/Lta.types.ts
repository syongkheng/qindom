import { ITB_LTA_BUSSTOP } from "../models/databases/tb_lta_busstop.js";
import { ITB_LTA_MRT_STATION } from "../models/databases/tb_lta_mrt_station.js";

// ── GET /lta/timing (LTA DataMall BusArrival v3, passed through) ──

/**
 * One upcoming bus from DataMall's BusArrival payload, passed through unchanged.
 * Only the fields fndom reads are typed; DataMall sends more (OriginCode, Latitude, …).
 * Every field is `""` when DataMall has no estimate for that slot.
 */
export interface BusArrivalNextBusDto {
  EstimatedArrival: string;
  /** "SEA" | "SDA" | "LSD" | "" */
  Load: string;
  /** "WAB" (wheelchair accessible) | "" */
  Feature: string;
  /** "SD" | "DD" | "BD" | "" */
  Type: string;
  [field: string]: unknown;
}

/** One bus service at the stop, as DataMall sends it (PascalCase is DataMall's, not ours). */
export interface BusArrivalServiceDto {
  ServiceNo: string;
  Operator: string;
  NextBus: BusArrivalNextBusDto;
  NextBus2: BusArrivalNextBusDto;
  NextBus3: BusArrivalNextBusDto;
  [field: string]: unknown;
}

export interface BusArrivalsDto {
  records: BusArrivalServiceDto[];
}

// ── GET /lta/bus/services (tb_lta_bus_info) ──

/** Values are kept as stored (VARCHAR), e.g. `distance: "4.1"`, `weekdayFirstBus: "0553"`, `"-"` = no service. */
export interface BusServiceDto {
  serviceNo: string;
  operator: string;
  direction: string;
  stopSequence: string;
  distance: string;
  weekdayFirstBus: string;
  weekdayLastBus: string;
  saturdayFirstBus: string;
  saturdayLastBus: string;
  sundayFirstBus: string;
  sundayLastBus: string;
}

export interface BusServicesDto {
  services: BusServiceDto[];
  count: number;
}

export interface BusStopCodeQuery {
  busStopCode: string;
}

// ── Proximity lookups used by GET /hdb/pphs/busstops and GET /hdb/pphs/mrt ──
// Raw rows (snake_case, internal): hdb maps them to its camelCase DTOs (`Hdb.types.ts`).

export type NearbyBusStopRow = Pick<ITB_LTA_BUSSTOP, "busstop_code" | "road_name" | "desc"> & {
  distance_m: number;
};

export interface NearbyBusStopsResult {
  /** The nearest stops, capped (see `NEARBY_BUS_STOPS_MAX_ROWS`). */
  rows: NearbyBusStopRow[];
  /** All stops inside the radius, before the cap. */
  count: number;
}

export type NearestMrtStationRow = Pick<ITB_LTA_MRT_STATION, "station" | "type"> & {
  distance_m: number;
};

export interface NearestMrtStationsResult {
  rows: NearestMrtStationRow[];
  count: number;
}
