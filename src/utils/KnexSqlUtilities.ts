import { Knex } from "knex";
import { LoggingUtilities } from "./logging/LoggingUtilities.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITB_LTA_BUSSTOP } from "../models/databases/tb_lta_busstop.js";
import { ITB_LTA_BUS_INFO } from "../models/databases/tb_lta_bus_info.js";
import { ITB_LTA_MRT_STATION } from "../models/databases/tb_lta_mrt_station.js";
import { toMessage } from "./errorUtils.js";

class KnexSqlUtilities {
  constructor(private knex: Knex) {
    this.pphs = {
      findBusStopsWithinRadiusOfLatLng: this._findBusStopsWithinRadiusOfLatLng.bind(this),
      findMrtStationsWithinRadiusOfLatLng: this._findMrtStationsWithinRadiusOfLatLng.bind(this),
    };
    this.lta = {
      findBusServicesByBusStopCode: this._findBusServicesByBusStopCode.bind(this),
    };
  }

  private sqlEvent(logEvent: IRequestLogEvent | undefined, label: string, durationMs: number): void {
    if (logEvent) {
      logEvent.children.push(`${label} - ${durationMs}ms`);
    }
  }

  // CREATE
  async insert<T = any, R = T>(table: string, data: Partial<T>, logEvent?: IRequestLogEvent): Promise<R> {
    try {
      const t0 = Date.now();
      const [id] = await this.knex(table).insert(data);
      const [row] = await this.knex(table).where({ id }).select("*");
      if (logEvent) {
        this.sqlEvent(logEvent, `${table}.insert()`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug("KnexSqlUtilities.insert", `Inserted into ${table} id=${id}`);
      }
      return row as R;
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.insert", `Insert error: ${toMessage(error)}`);
      throw new Error(`Insert failed: ${toMessage(error)}`);
    }
  }

  // READ - Single record
  async findOne<T = any>(
    table: string,
    whereClause: Partial<T> = {},
    columns: readonly string[] = ["*"],
    logContext?: IRequestLogEvent,
  ): Promise<T | undefined> {
    try {
      const query = this.knex(table).select(columns).where(whereClause).first();
      const t0 = Date.now();
      const result = await query;
      if (logContext) {
        this.sqlEvent(logContext, `${table}.findOne()`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug("KnexSqlUtilities.findOne", `Executing query - [ ${query.toQuery()} ]`);
      }
      return result as T | undefined;
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.findOne", `Find one error: ${toMessage(error)}`);
      throw new Error(`Find one failed: ${toMessage(error)}`);
    }
  }

  // READ - Multiple records
  async find<T = any>(
    table: string,
    whereClause: Partial<T> = {},
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: "asc" | "desc";
      columns?: readonly string[];
      extraWhere?: (queryBuilder: Knex.QueryBuilder) => void;
    } = {},
    logEvent?: IRequestLogEvent,
  ): Promise<T[]> {
    try {
      let query = this.knex(table).where(whereClause);

      if (options.extraWhere) options.extraWhere(query);
      if (options.limit) query = query.limit(options.limit);
      if (options.offset) query = query.offset(options.offset);
      if (options.orderBy) query = query.orderBy(options.orderBy, options.orderDirection || "asc");
      query = options.columns ? query.select(options.columns) : query.select("*");

      const t0 = Date.now();
      const result = await query;
      if (logEvent) {
        this.sqlEvent(logEvent, `${table}.find(${JSON.stringify(whereClause)})`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug("KnexSqlUtilities.find", `Executing query - [ ${query.toQuery()} ]`);
      }

      return result as T[];
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.find", `Find error: ${toMessage(error)}`);
      throw new Error(`Find failed: ${toMessage(error)}`);
    }
  }

  // UPDATE
  async update<T = any, R = T>(
    table: string,
    whereClause: Partial<T>,
    data: Partial<T>,
    logEvent?: IRequestLogEvent,
  ): Promise<R[]> {
    try {
      const t0 = Date.now();
      await this.knex(table).where(whereClause).update(data);
      const rows = await this.knex(table).where(whereClause).select("*");
      if (logEvent) {
        this.sqlEvent(logEvent, `${table}.update()`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug("KnexSqlUtilities.update", `Updated ${table}`);
      }
      return rows as R[];
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.update", `Update error: ${toMessage(error)}`);
      throw new Error(`Update failed: ${toMessage(error)}`);
    }
  }

  // DELETE
  async delete<T = any>(table: string, whereClause: Partial<T>, logEvent?: IRequestLogEvent): Promise<number> {
    try {
      const t0 = Date.now();
      const result = await this.knex(table).where(whereClause).delete();
      if (logEvent) {
        this.sqlEvent(logEvent, `${table}.delete()`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug("KnexSqlUtilities.delete", `Deleted from ${table}`);
      }
      return result;
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.delete", `Delete error: ${toMessage(error)}`);
      throw new Error(`Delete failed: ${toMessage(error)}`);
    }
  }

  // RAW
  async raw<T = any>(sql: string, bindings: any[] = []): Promise<T> {
    try {
      const query = this.knex.raw(sql, bindings);
      LoggingUtilities.service.debug("KnexSqlUtilities.raw", `Executing raw query - [ ${query.toQuery()} ]`);
      const [rows] = await query;
      return rows as T;
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.raw", `Raw query error: ${toMessage(error)}`);
      throw new Error(`Raw query failed: ${toMessage(error)}`);
    }
  }

  // COUNT
  async count<T = any>(table: string, whereClause: Partial<T> = {}, logEvent?: IRequestLogEvent): Promise<number> {
    try {
      const query = this.knex(table).where(whereClause).count<{ count: number }[]>({ count: "*" });
      const t0 = Date.now();
      const result = await query;
      if (logEvent) {
        this.sqlEvent(logEvent, `${table}.count()`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug("KnexSqlUtilities.count", `Executing query - [ ${query.toQuery()} ]`);
      }
      return Number(result[0]?.count || 0);
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.count", `Count error: ${toMessage(error)}`);
      throw new Error(`Count failed: ${toMessage(error)}`);
    }
  }

  async transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    try {
      LoggingUtilities.service.debug("KnexSqlUtilities.transaction", `Starting transaction`);

      const result = await this.knex.transaction(async (trx) => {
        const output = await callback(trx);
        return output;
      });

      LoggingUtilities.service.debug("KnexSqlUtilities.transaction", `Transaction committed successfully`);

      return result;
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.transaction", `Transaction failed: ${toMessage(error)}`);
      throw new Error(`Transaction failed: ${toMessage(error)}`);
    }
  }

  pphs: {
    findBusStopsWithinRadiusOfLatLng: (
      pphsLat: string,
      pphsLng: string,
      radiusInMeters: number,
    ) => Promise<{
      rows: (ITB_LTA_BUSSTOP & { distance_m: number })[];
      count: number;
    }>;
    findMrtStationsWithinRadiusOfLatLng: (
      pphsLat: string,
      pphsLng: string,
      numberOfStations: number,
    ) => Promise<{
      rows: (ITB_LTA_MRT_STATION & { distance_m: number })[];
      count: number;
    }>;
  };

  private async _findBusStopsWithinRadiusOfLatLng(
    pphsLat: string,
    pphsLng: string,
    radiusInMeters: number,
  ): Promise<{
    rows: (ITB_LTA_BUSSTOP & { distance_m: number })[];
    count: number;
  }> {
    try {
      const sql = `
      SELECT 
        b.busstop_code,
        b.road_name,
        b.desc,
        b.lat,
        b.lng,
        ST_Distance_Sphere(POINT(b.lng, b.lat), POINT(?, ?)) AS distance_m
      FROM tb_lta_busstop b
      WHERE ST_Distance_Sphere(POINT(b.lng, b.lat), POINT(?, ?)) <= ?
      ORDER BY distance_m ASC
    `;

      const bindings = [pphsLng, pphsLat, pphsLng, pphsLat, radiusInMeters];
      const query = this.knex.raw(sql, bindings);

      LoggingUtilities.service.debug(
        "KnexSqlUtilities.lta.findBusStopsWithinRadius",
        `Executing raw query - [ ${query.toQuery()} ]`,
      );

      const [rows] = await query;

      // ✅ Normalize and count
      const allRows = rows as (ITB_LTA_BUSSTOP & { distance_m: number })[];
      const count = allRows.length;

      const resultRows = allRows.slice(0, 10);

      return { rows: resultRows, count };
    } catch (error) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.lta.findBusStopsWithinRadius",
        `Query error: ${toMessage(error)}`,
      );
      throw new Error(`Failed to find nearby bus stops: ${toMessage(error)}`);
    }
  }

  private async _findMrtStationsWithinRadiusOfLatLng(
    pphsLat: string,
    pphsLng: string,
    numberOfStations: number,
  ): Promise<{
    rows: (ITB_LTA_MRT_STATION & { distance_m: number })[];
    count: number;
  }> {
    try {
      const sql = `
        SELECT 
            e.station,
            e.type,
            MIN(ST_Distance_Sphere(POINT(e.lat, e.lng), POINT(?, ?))) AS distance_m
        FROM tb_lrt_mrt_station e
        GROUP BY e.station, e.type
        ORDER BY distance_m ASC
        LIMIT ?;
    `;

      const bindings = [pphsLng, pphsLat, numberOfStations ?? 3];
      const query = this.knex.raw(sql, bindings);

      LoggingUtilities.service.debug(
        "KnexSqlUtilities.lta.findBusStopsWithinRadius",
        `Executing raw query - [ ${query.toQuery()} ]`,
      );

      const [rows] = await query;

      // ✅ Normalize and count
      const allRows = rows as (ITB_LTA_MRT_STATION & { distance_m: number })[];
      const count = allRows.length;

      return { rows: allRows, count };
    } catch (error) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.lta.findBusStopsWithinRadius",
        `Query error: ${toMessage(error)}`,
      );
      throw new Error(`Failed to find nearby bus stops: ${toMessage(error)}`);
    }
  }

  lta: {
    findBusServicesByBusStopCode(busstopCode: string): Promise<{
      rows: ITB_LTA_BUS_INFO[];
      count: number;
    }>;
  };

  private async _findBusServicesByBusStopCode(busstopCode: string): Promise<{
    rows: ITB_LTA_BUS_INFO[];
    count: number;
  }> {
    try {
      const sql = `
      SELECT 
        service_no,
        operator,
        direction,
        stop_sequence,
        distance,
        wd_first_bus,
        wd_last_bus,
        sat_first_bus,
        sat_last_bus,
        sun_first_bus,
        sun_last_bus
      FROM tb_lta_bus_info
      WHERE busstop_code = ?
      ORDER BY CAST(service_no AS UNSIGNED), service_no
    `;

      const bindings = [busstopCode];
      const query = this.knex.raw(sql, bindings);

      LoggingUtilities.service.debug(
        "KnexSqlUtilities.lta.findBusServicesByBusStopCode",
        `Executing raw query - [ ${query.toQuery()} ]`,
      );

      const [rows] = await query;

      const allRows = rows as ITB_LTA_BUS_INFO[];
      const count = allRows.length;

      const resultRows = allRows;

      return { rows: resultRows, count };
    } catch (error) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.lta.findBusServicesByBusStopCode",
        `Query error: ${toMessage(error)}`,
      );
      throw new Error(`Failed to find bus services: ${toMessage(error)}`);
    }
  }

  async upsert<T = any>(
    table: string,
    data: Partial<T>,
    conflictKey: string,
    updateData?: Partial<T>,
    logEvent?: IRequestLogEvent,
  ): Promise<void> {
    try {
      const query = this.knex(table)
        .insert(data)
        .onConflict(conflictKey)
        .merge(updateData ?? data);
      const t0 = Date.now();
      await query;
      if (logEvent) {
        this.sqlEvent(logEvent, `${table}.upsert()`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug("KnexSqlUtilities.upsert", `Executing query - [ ${query.toQuery()} ]`);
      }
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.upsert", `Upsert error: ${toMessage(error)}`);
      throw new Error(`Upsert failed: ${toMessage(error)}`);
    }
  }
}

export default KnexSqlUtilities;
