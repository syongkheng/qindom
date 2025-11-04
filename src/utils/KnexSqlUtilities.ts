import { Knex } from "knex";
import { LoggingUtilities } from "./LoggingUtilities";
import { ITB_LTA_BUSSTOP } from "../models/databases/tb_lta_busstop";
import { ITB_LTA_BUS_INFO } from "../models/databases/tb_lta_bus_info";

class KnexSqlUtilities {
  constructor(private knex: Knex) {
    this.pphs = {
      findBusStopsWithinRadiusOfLatLng:
        this._findBusStopsWithinRadiusOfLatLng.bind(this),
    };
    this.lta = {
      findBusServicesByBusStopCode:
        this._findBusServicesByBusStopCode.bind(this),
    };
  }

  // CREATE
  async insert<T = any, R = T>(table: string, data: Partial<T>): Promise<R> {
    try {
      const query = this.knex(table).insert(data);
      const [id] = await query;
      // Fetch the inserted row manually if needed
      LoggingUtilities.service.debug(
        "KnexSqlUtilities.find",
        `Executing query - [ ${query.toQuery()} ]`
      );
      const [row] = await this.knex(table).where({ id }).select("*");
      return row as R;
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.insert",
        `Insert error: ${error.message}`
      );
      throw new Error(`Insert failed: ${error.message}`);
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
      LoggingUtilities.service.debug(
        "KnexSqlUtilities.findOne",
        `Executing query - [ ${query.toQuery()} ]`
      );
      return (await query) as T | undefined;
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.findOne",
        `Find one error: ${error.message}`
      );
      throw new Error(`Find one failed: ${error.message}`);
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
      if (options.orderBy)
        query = query.orderBy(options.orderBy, options.orderDirection || "asc");

      query = options.columns
        ? query.select(options.columns)
        : query.select("*");

      LoggingUtilities.service.debug(
        "KnexSqlUtilities.find",
        `Executing query - [ ${query.toQuery()} ]`
      );

      return (await query) as T[];
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.find",
        `Find error: ${error.message}`
      );
      throw new Error(`Find failed: ${error.message}`);
    }
  }

  // UPDATE
  async update<T = any, R = T>(
    table: string,
    whereClause: Partial<T>,
    data: Partial<T>
  ): Promise<R[]> {
    try {
      const query = this.knex(table).where(whereClause).update(data);
      LoggingUtilities.service.debug(
        "KnexSqlUtilities.update",
        `Executing query - [ ${query.toQuery()} ]`
      );
      await query;
      const rows = await this.knex(table).where(whereClause).select("*");
      return rows as R[];
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.update",
        `Update error: ${error.message}`
      );
      throw new Error(`Update failed: ${error.message}`);
    }
  }

  // DELETE
  async delete<T = any>(
    table: string,
    whereClause: Partial<T>
  ): Promise<number> {
    try {
      const query = this.knex(table).where(whereClause).delete();
      LoggingUtilities.service.debug(
        "KnexSqlUtilities.delete",
        `Executing query - [ ${query.toQuery()} ]`
      );
      const result = await query;
      return result; // returns number of deleted rows
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.delete",
        `Delete error: ${error.message}`
      );
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  // RAW
  async raw<T = any>(sql: string, bindings: any[] = []): Promise<T> {
    try {
      const query = this.knex.raw(sql, bindings);
      LoggingUtilities.service.debug(
        "KnexSqlUtilities.raw",
        `Executing raw query - [ ${query.toQuery()} ]`
      );
      const [rows] = await query;
      return rows as T;
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.raw",
        `Raw query error: ${error.message}`
      );
      throw new Error(`Raw query failed: ${error.message}`);
    }
  }

  // COUNT
  async count<T = any>(
    table: string,
    whereClause: Partial<T> = {}
  ): Promise<number> {
    try {
      const query = this.knex(table)
        .where(whereClause)
        .count<{ count: number }[]>({ count: "*" });
      LoggingUtilities.service.debug(
        "KnexSqlUtilities.count",
        `Executing query - [ ${query.toQuery()} ]`
      );
      const result = await query;
      return Number(result[0]?.count || 0);
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.count",
        `Count error: ${error.message}`
      );
      throw new Error(`Count failed: ${error.message}`);
    }
  }

  async transaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    try {
      LoggingUtilities.service.debug(
        "KnexSqlUtilities.transaction",
        `Starting transaction`
      );

      const result = await this.knex.transaction(async (trx) => {
        const output = await callback(trx);
        return output;
      });

      LoggingUtilities.service.debug(
        "KnexSqlUtilities.transaction",
        `Transaction committed successfully`
      );

      return result;
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.transaction",
        `Transaction failed: ${error.message}`
      );
      throw new Error(`Transaction failed: ${error.message}`);
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
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.lta.findBusStopsWithinRadius",
        `Query error: ${error.message}`
      );
      throw new Error(`Failed to find nearby bus stops: ${error.message}`);
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
    } catch (error: any) {
      LoggingUtilities.service.error(
        "KnexSqlUtilities.lta.findBusServicesByBusStopCode",
        `Query error: ${error.message}`
      );
      throw new Error(`Failed to find bus services: ${error.message}`);
    }
  }
}

export default KnexSqlUtilities;
