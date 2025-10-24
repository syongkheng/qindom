import { Knex } from "knex";
import { LoggingUtilities } from "./LoggingUtilities";

class KnexSqlUtilities {
  constructor(private knex: Knex) {}

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
}

export default KnexSqlUtilities;
