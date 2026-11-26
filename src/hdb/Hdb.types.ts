// ── PPHS flats (scraped from the HDB website, cached per batch in tb_hdb_pphs.json_string) ──

/** Units available per flat type, as printed on the HDB page (e.g. "12"). Types showing "-" are omitted. */
export interface PphsFlatTypes {
  "2-room"?: string;
  "3-room"?: string;
  "4-room"?: string;
}

/** One row of the HDB PPHS table. Also the shape stored in `tb_hdb_pphs.json_string`, so keep it stable. */
export interface PphsRecord {
  town: string;
  address: string;
  flatTypes: PphsFlatTypes;
  /** Free text from the page, e.g. "Dec 2027". */
  siteExpiry: string;
}

/** Where a record's coordinates came from. Stored rows only ever produce DATABASE or UNPARSEABLE. */
export const CoordinateSource = {
  /** Cached in tb_hdb_pphs_coordinate. */
  DATABASE: "database",
  ONEMAP: "onemap",
  NOMINATIM: "nominatim",
  /** No geocoder found it (not cached, retried next time). */
  ERROR: "error",
  /** Multi-block address or coordinates cleared by an admin (cached as blank). */
  UNPARSEABLE: "unparseable",
} as const;
export type CoordinateSource = (typeof CoordinateSource)[keyof typeof CoordinateSource];

/** The two live geocoders an admin can pick from. */
export type GeocoderSource = typeof CoordinateSource.ONEMAP | typeof CoordinateSource.NOMINATIM;

/** `lat`/`lng` are strings as stored (VARCHAR(16)); all three are `""` when there are no coordinates. */
export interface CoordinatesDto {
  lat: string;
  lng: string;
  /** Google Maps link for the point. */
  formedUrl: string;
}

export interface ResolvedCoordinatesDto extends CoordinatesDto {
  source: CoordinateSource;
}

export interface CoordinateOptionDto extends CoordinatesDto {
  source: GeocoderSource;
}

export type PphsRecordDto = PphsRecord & ResolvedCoordinatesDto;

export interface PphsListDto {
  records: PphsRecordDto[];
}

/** The saved point (`formedUrl` built by the server) and what was written. */
export interface CoordinatesUpdatedDto extends CoordinatesDto {
  /** Cache rows written for the address: the rows overwritten, or 1 when the row was created. */
  updated: number;
  /** True when the address had no cached row and one was inserted. */
  created: boolean;
}

export interface CoordinatesClearedDto {
  cleared: true;
}

// ── Nearby transport (data owned by LtaService) ──

/** Text fields come from nullable `tb_lta_busstop` VARCHARs. */
export interface NearbyBusStopDto {
  busStopCode: string | null;
  roadName: string | null;
  description: string | null;
  /** Whole metres from the requested point. */
  distanceM: number;
}

export interface NearbyBusStopsDto {
  /** The nearest stops inside the radius, nearest first (at most `NEARBY_BUS_STOPS_MAX_ROWS`). */
  busStops: NearbyBusStopDto[];
  /** Every stop inside the radius, before the cap. */
  count: number;
}

export interface NearestMrtStationDto {
  station: string | null;
  /** "MRT" | "LRT" (nullable column) */
  type: string | null;
  /** Whole metres from the requested point to the station's closest exit. */
  distanceM: number;
}

export interface NearestMrtStationsDto {
  stations: NearestMrtStationDto[];
  count: number;
}

// ── Requests ──

export interface PphsListQuery {
  /** `YYYYMM`; null = the current month in Singapore. */
  batch: string | null;
}

export interface AddressBody {
  address: string;
}

/** A client-sent `formedUrl` is ignored (the server builds it from lat/lng). */
export interface CoordinatesUpdateBody {
  address: string;
  lat: string;
  lng: string;
}

export interface NearbyBusStopsQuery {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface NearestMrtStationsQuery {
  lat: number;
  lng: number;
  limit: number;
}
