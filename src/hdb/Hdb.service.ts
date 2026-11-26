import { Exceptions } from "../exceptions/AppExceptions.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITB_HDB_PPHS } from "../models/databases/tb_hdb_pphs.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { APP_TIMEZONE } from "../constants/Locale.js";
import { LtaService } from "../lta/Lta.service.js";
import { NearbyBusStopRow, NearestMrtStationRow } from "../lta/Lta.types.js";
import { HdbCoordinateService } from "./HdbCoordinate.service.js";
import { parsePphsPage } from "./HdbPphs.parser.js";
import {
  NearbyBusStopDto,
  NearbyBusStopsDto,
  NearbyBusStopsQuery,
  NearestMrtStationDto,
  NearestMrtStationsDto,
  NearestMrtStationsQuery,
  PphsListDto,
  PphsRecord,
} from "./Hdb.types.js";

const HDB_PPHS_TABLE = "tb_hdb_pphs";
/** `created_by` for batches scraped by the server. */
const SYSTEM_USER = "SYSTEM";

const HDB_SERVICE_NAME = "HDB website";
const HDB_PPHS_PAGE_URL =
  "https://www.hdb.gov.sg/renting-a-flat/parenthood-provisional-housing-scheme/application-process/pphs-flats-available-for-application";
// The HDB site refuses requests without a browser-like User-Agent.
const HDB_REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
};

const BATCH_NOT_FOUND_MESSAGE = "Batch not found";

const BATCH_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit" });

/** HDB releases PPHS batches in even months. */
const BATCH_MONTH_STEP = 2;
const DECEMBER = 12;

/**
 * The current batch `YYYYMM`: the latest even month up to `now` in Singapore (Nov 2026 → 202610,
 * Dec 2026 → 202612, Jan 2027 → 202612). The default for `GET /pphs` and the only batch that may be
 * scraped. Keep in step with fndom's batch switcher (`pphsBatch` in src/components/views/hdb/HomeView.vue),
 * whose default is the same month, so the page's default request is always one the server can fill.
 */
export function currentPphsBatch(now: Date = new Date()): string {
  const parts = BATCH_FORMAT.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  let year = part("year");
  let month = part("month");
  if (month % BATCH_MONTH_STEP !== 0) month -= 1;
  if (month === 0) {
    month = DECEMBER;
    year -= 1;
  }
  return `${year}${String(month).padStart(2, "0")}`;
}

export function toNearbyBusStopDto(row: NearbyBusStopRow): NearbyBusStopDto {
  return {
    busStopCode: row.busstop_code,
    roadName: row.road_name,
    description: row.desc,
    distanceM: Math.round(Number(row.distance_m)),
  };
}

export function toNearestMrtStationDto(row: NearestMrtStationRow): NearestMrtStationDto {
  return { station: row.station, type: row.type, distanceM: Math.round(Number(row.distance_m)) };
}

/** PPHS flats (owns `tb_hdb_pphs`) with their coordinates, and nearby transport via LtaService. */
export class HdbService {
  private coordinates: HdbCoordinateService;
  private lta: LtaService;

  constructor(private db: KnexSqlUtilities) {
    this.coordinates = new HdbCoordinateService(db);
    this.lta = new LtaService(db);
  }

  /**
   * A batch's PPHS flats with coordinates. A stored batch is read from the DB. Only the current
   * batch (this month in Singapore) is ever scraped: the HDB page shows today's flats, so storing it
   * under another month would be wrong. Any other unstored batch → 404, with no outbound call.
   * HDB unreachable or the page layout changed → 502.
   */
  async listPphs(batch: string | null, logContext?: IRequestLogContext): Promise<PphsListDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "PPHS list");
    const currentBatch = currentPphsBatch();
    const batchKey = batch ?? currentBatch;

    let records = await this.loadBatch(batchKey, event);
    const from = records ? "database" : HDB_SERVICE_NAME;
    if (!records) {
      if (batchKey !== currentBatch) throw new Exceptions.NotFound(BATCH_NOT_FOUND_MESSAGE);
      records = await this.scrapePphsPage();
      await this.storeBatch(batchKey, records, event);
    }

    const withCoordinates = await Promise.all(
      records.map(async (record) => ({ ...record, ...(await this.coordinates.resolve(record.address, event)) })),
    );
    if (event) event.detail = `batch ${batchKey}: ${records.length} record(s) from ${from}`;
    return { records: withCoordinates };
  }

  async findBusStopsNear(query: NearbyBusStopsQuery, logContext?: IRequestLogContext): Promise<NearbyBusStopsDto> {
    const { rows, count } = await this.lta.findBusStopsNear(query.lat, query.lng, query.radiusM, logContext);
    return { busStops: rows.map(toNearbyBusStopDto), count };
  }

  async findNearestMrtStations(
    query: NearestMrtStationsQuery,
    logContext?: IRequestLogContext,
  ): Promise<NearestMrtStationsDto> {
    const { rows, count } = await this.lta.findNearestMrtStations(query.lat, query.lng, query.limit, logContext);
    return { stations: rows.map(toNearestMrtStationDto), count };
  }

  // ── Batches ──

  /** The stored batch, or null when there is none (or its JSON is unreadable, so it's scraped again). */
  private async loadBatch(batch: string, event?: IRequestLogEvent): Promise<PphsRecord[] | null> {
    const row = await this.db.findOne<ITB_HDB_PPHS>(HDB_PPHS_TABLE, { batch }, ["json_string"], event);
    if (!row) return null;
    try {
      return JSON.parse(row.json_string) as PphsRecord[];
    } catch {
      LoggingUtilities.service.error("HdbService.loadBatch", `Stored JSON for batch ${batch} is unreadable`);
      return null;
    }
  }

  /** Best effort: a failed write (e.g. a concurrent request stored the batch first) still returns the records. */
  private async storeBatch(batch: string, records: PphsRecord[], event?: IRequestLogEvent): Promise<void> {
    try {
      await this.db.insert<ITB_HDB_PPHS>(
        HDB_PPHS_TABLE,
        { batch, json_string: JSON.stringify(records), created_dt: Date.now(), created_by: SYSTEM_USER },
        event,
      );
    } catch (error) {
      LoggingUtilities.service.error("HdbService.storeBatch", `Storing batch ${batch} failed: ${toMessage(error)}`);
    }
  }

  private async scrapePphsPage(): Promise<PphsRecord[]> {
    let html: string;
    try {
      const response = await fetch(HDB_PPHS_PAGE_URL, { headers: HDB_REQUEST_HEADERS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
    } catch (error) {
      LoggingUtilities.service.error("HdbService.scrapePphsPage", `${HDB_SERVICE_NAME} failed: ${toMessage(error)}`);
      throw new Exceptions.ExternalRequest(HDB_SERVICE_NAME);
    }

    const records = parsePphsPage(html);
    if (!records) {
      LoggingUtilities.service.error("HdbService.scrapePphsPage", "PPHS table not found: the page layout changed");
      throw new Exceptions.ExternalRequest(HDB_SERVICE_NAME);
    }
    return records;
  }
}
