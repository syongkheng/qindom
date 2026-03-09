import { Knex } from "knex";
import { LoggingUtilities } from "./LoggingUtilities";
import { ITB_LTA_BUSSTOP } from "../models/databases/tb_lta_busstop";
import { ITB_LTA_BUS_INFO } from "../models/databases/tb_lta_bus_info";
import { ITB_LTA_MRT_STATION } from "../models/databases/tb_lta_mrt_station";
import { toMessage } from "./errorUtils";

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

  // CREATE
  async insert<T = any, R = T>(table: string, data: Partial<T>): Promise<R> {
    try {
      const query = this.knex(table).insert(data);
      const [id] = await query;
      // Fetch the inserted row manually if needed
      LoggingUtilities.service.debug("KnexSqlUtilities.find", `Executing query - [ ${query.toQuery()} ]`);
      const [row] = await this.knex(table).where({ id }).select("*");
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
    columns: readonly string[] = ["*"]
  ): Promise<T | undefined> {
    try {
      const query = this.knex(table).select(columns).where(whereClause).first();
      LoggingUtilities.service.debug("KnexSqlUtilities.findOne", `Executing query - [ ${query.toQuery()} ]`);
      return (await query) as T | undefined;
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
      extraWhere?: (queryBuilder: Knex.QueryBuilder) => void; // 👈 NEW
    } = {}
  ): Promise<T[]> {
    try {
      let query = this.knex(table).where(whereClause);

      // Apply additional complex conditions if provided
      if (options.extraWhere) {
        options.extraWhere(query);
      }

      if (options.limit) query = query.limit(options.limit);
      if (options.offset) query = query.offset(options.offset);
      if (options.orderBy) query = query.orderBy(options.orderBy, options.orderDirection || "asc");

      query = options.columns ? query.select(options.columns) : query.select("*");

      LoggingUtilities.service.debug("KnexSqlUtilities.find", `Executing query - [ ${query.toQuery()} ]`);

      return (await query) as T[];
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.find", `Find error: ${toMessage(error)}`);
      throw new Error(`Find failed: ${toMessage(error)}`);
    }
  }

  // UPDATE
  async update<T = any, R = T>(table: string, whereClause: Partial<T>, data: Partial<T>): Promise<R[]> {
    try {
      const query = this.knex(table).where(whereClause).update(data);
      LoggingUtilities.service.debug("KnexSqlUtilities.update", `Executing query - [ ${query.toQuery()} ]`);
      await query;
      const rows = await this.knex(table).where(whereClause).select("*");
      return rows as R[];
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.update", `Update error: ${toMessage(error)}`);
      throw new Error(`Update failed: ${toMessage(error)}`);
    }
  }

  // DELETE
  async delete<T = any>(table: string, whereClause: Partial<T>): Promise<number> {
    try {
      const query = this.knex(table).where(whereClause).delete();
      LoggingUtilities.service.debug("KnexSqlUtilities.delete", `Executing query - [ ${query.toQuery()} ]`);
      const result = await query;
      return result; // returns number of deleted rows
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
  async count<T = any>(table: string, whereClause: Partial<T> = {}): Promise<number> {
    try {
      const query = this.knex(table).where(whereClause).count<{ count: number }[]>({ count: "*" });
      LoggingUtilities.service.debug("KnexSqlUtilities.count", `Executing query - [ ${query.toQuery()} ]`);
      const result = await query;
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
      radiusInMeters: number
    ) => Promise<{
      rows: (ITB_LTA_BUSSTOP & { distance_m: number })[];
      count: number;
    }>;
    findMrtStationsWithinRadiusOfLatLng: (
      pphsLat: string,
      pphsLng: string,
      numberOfStations: number
    ) => Promise<{
      rows: (ITB_LTA_MRT_STATION & { distance_m: number })[];
      count: number;
    }>;
  };

  private async _findBusStopsWithinRadiusOfLatLng(
    pphsLat: string,
    pphsLng: string,
    radiusInMeters: number
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
        `Executing raw query - [ ${query.toQuery()} ]`
      );

      const [rows] = await query;

      // ✅ Normalize and count
      const allRows = rows as (ITB_LTA_BUSSTOP & { distance_m: number })[];
      const count = allRows.length;

      const resultRows = allRows.slice(0, 10);

      return { rows: resultRows, count };
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.lta.findBusStopsWithinRadius", `Query error: ${toMessage(error)}`);
      throw new Error(`Failed to find nearby bus stops: ${toMessage(error)}`);
    }
  }

  private async _findMrtStationsWithinRadiusOfLatLng(
    pphsLat: string,
    pphsLng: string,
    numberOfStations: number
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
        `Executing raw query - [ ${query.toQuery()} ]`
      );

      const [rows] = await query;

      // ✅ Normalize and count
      const allRows = rows as (ITB_LTA_MRT_STATION & { distance_m: number })[];
      const count = allRows.length;

      return { rows: allRows, count };
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.lta.findBusStopsWithinRadius", `Query error: ${toMessage(error)}`);
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
        `Executing raw query - [ ${query.toQuery()} ]`
      );

      const [rows] = await query;

      const allRows = rows as ITB_LTA_BUS_INFO[];
      const count = allRows.length;

      const resultRows = allRows;

      return { rows: resultRows, count };
    } catch (error) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.lta.findBusServicesByBusStopCode",
        `Query error: ${toMessage(error)}`
      );
      throw new Error(`Failed to find bus services: ${toMessage(error)}`);
    }
  }

  async upsert<T = any>(table: string, data: Partial<T>, conflictKey: string, updateData?: Partial<T>): Promise<void> {
    try {
      const query = this.knex(table)
        .insert(data)
        .onConflict(conflictKey)
        .merge(updateData ?? data);

      LoggingUtilities.service.debug("KnexSqlUtilities.upsert", `Executing query - [ ${query.toQuery()} ]`);

      await query;
    } catch (error) {
      LoggingUtilities.service.error("KnexSqlUtilities.upsert", `Upsert error: ${toMessage(error)}`);
      throw new Error(`Upsert failed: ${toMessage(error)}`);
    }
  }
}

export default KnexSqlUtilities;
