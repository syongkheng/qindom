import { Knex } from "knex";
import { LoggingUtilities } from "./logging/LoggingUtilities.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { BaseException } from "../exceptions/AppExceptions.js";
import { toMessage } from "./ErrorUtilities.js";

const LOG_LABEL = "KnexSqlUtilities";

export interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  columns?: readonly string[];
  extraWhere?: (queryBuilder: Knex.QueryBuilder) => void;
}

/**
 * Wraps a driver error in a plain `Error` (→ generic 500 via `route()`), keeping the original as
 * `cause` so the request tree's exception event still shows what the driver said.
 */
function wrapDbError(method: string, operation: string, error: unknown): Error {
  LoggingUtilities.service.error(`${LOG_LABEL}.${method}`, `${operation} error: ${toMessage(error)}`);
  return Object.assign(new Error(`${operation} failed: ${toMessage(error)}`), { cause: error });
}

/**
 * The only way services talk to MySQL. Every method takes an optional request-log event (last
 * parameter) and adds a timed line to it; without one it writes a console debug line instead.
 * Driver errors become plain `Error`s (500); module SQL lives in the owning service, never here.
 */
class KnexSqlUtilities {
  constructor(private knex: Knex) {}

  private sqlEvent(logEvent: IRequestLogEvent | undefined, label: string, durationMs: number): void {
    logEvent?.children.push(`${label} - ${durationMs}ms`);
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
        LoggingUtilities.service.debug(`${LOG_LABEL}.insert`, `Inserted into ${table} id=${id}`);
      }
      return row as R;
    } catch (error) {
      throw wrapDbError("insert", "Insert", error);
    }
  }

  // READ - Single record
  async findOne<T = any>(
    table: string,
    whereClause: Partial<T> = {},
    columns: readonly string[] = ["*"],
    logEvent?: IRequestLogEvent,
  ): Promise<T | undefined> {
    try {
      const query = this.knex(table).select(columns).where(whereClause).first();
      const t0 = Date.now();
      const result = await query;
      if (logEvent) {
        this.sqlEvent(logEvent, `${table}.findOne()`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug(`${LOG_LABEL}.findOne`, `Executing query - [ ${query.toQuery()} ]`);
      }
      return result as T | undefined;
    } catch (error) {
      throw wrapDbError("findOne", "Find one", error);
    }
  }

  // READ - Multiple records
  async find<T = any>(
    table: string,
    whereClause: Partial<T> = {},
    options: FindOptions = {},
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
        this.sqlEvent(
          logEvent,
          `${table}.find(${JSON.stringify(LoggingUtilities.redact(whereClause))})`,
          Date.now() - t0,
        );
      } else {
        LoggingUtilities.service.debug(`${LOG_LABEL}.find`, `Executing query - [ ${query.toQuery()} ]`);
      }

      return result as T[];
    } catch (error) {
      throw wrapDbError("find", "Find", error);
    }
  }

  // UPDATE (returns the matching rows re-read after the update)
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
        LoggingUtilities.service.debug(`${LOG_LABEL}.update`, `Updated ${table}`);
      }
      return rows as R[];
    } catch (error) {
      throw wrapDbError("update", "Update", error);
    }
  }

  /** UPDATE without re-reading the rows: returns how many rows the DB reports as affected. */
  async updateCount<T = any>(
    table: string,
    whereClause: Partial<T>,
    data: Partial<T>,
    logEvent?: IRequestLogEvent,
  ): Promise<number> {
    try {
      const t0 = Date.now();
      const affected = await this.knex(table).where(whereClause).update(data);
      if (logEvent) {
        this.sqlEvent(logEvent, `${table}.updateCount()`, Date.now() - t0);
      } else {
        LoggingUtilities.service.debug(`${LOG_LABEL}.updateCount`, `Updated ${affected} row(s) in ${table}`);
      }
      return affected;
    } catch (error) {
      throw wrapDbError("updateCount", "Update", error);
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
        LoggingUtilities.service.debug(`${LOG_LABEL}.delete`, `Deleted from ${table}`);
      }
      return result;
    } catch (error) {
      throw wrapDbError("delete", "Delete", error);
    }
  }

  // RAW (always use bindings)
  async raw<T = any>(sql: string, bindings: readonly unknown[] = [], logEvent?: IRequestLogEvent): Promise<T> {
    try {
      const query = this.knex.raw(sql, bindings as readonly Knex.RawBinding[]);
      const t0 = Date.now();
      if (!logEvent) {
        LoggingUtilities.service.debug(`${LOG_LABEL}.raw`, `Executing raw query - [ ${query.toQuery()} ]`);
      }
      const [rows] = await query;
      this.sqlEvent(logEvent, "raw()", Date.now() - t0);
      return rows as T;
    } catch (error) {
      throw wrapDbError("raw", "Raw query", error);
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
        LoggingUtilities.service.debug(`${LOG_LABEL}.count`, `Executing query - [ ${query.toQuery()} ]`);
      }
      return Number(result[0]?.count || 0);
    } catch (error) {
      throw wrapDbError("count", "Count", error);
    }
  }

  /**
   * Runs `callback` in one transaction (commit on success, rollback on any throw).
   *
   * The callback gets the raw knex `trx` and `tx`, a `KnexSqlUtilities` bound to the same
   * transaction: prefer `tx.insert/update/updateCount/find/...(…, event)` so each statement is
   * timed in the request tree. A typed exception (`BaseException`) thrown inside is rethrown
   * unchanged (keeps its 4xx); anything else becomes a plain `Error` (500) with the cause kept.
   */
  async transaction<T>(
    callback: (trx: Knex.Transaction, tx: KnexSqlUtilities) => Promise<T>,
    logEvent?: IRequestLogEvent,
  ): Promise<T> {
    const t0 = Date.now();
    try {
      if (!logEvent) LoggingUtilities.service.debug(`${LOG_LABEL}.transaction`, "Starting transaction");
      const result = await this.knex.transaction((trx) => callback(trx, new KnexSqlUtilities(trx)));
      if (logEvent) {
        this.sqlEvent(logEvent, "transaction() committed", Date.now() - t0);
      } else {
        LoggingUtilities.service.debug(`${LOG_LABEL}.transaction`, "Transaction committed successfully");
      }
      return result;
    } catch (error) {
      this.sqlEvent(logEvent, "transaction() rolled back", Date.now() - t0);
      if (error instanceof BaseException) throw error;
      throw wrapDbError("transaction", "Transaction", error);
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
        LoggingUtilities.service.debug(`${LOG_LABEL}.upsert`, `Executing query - [ ${query.toQuery()} ]`);
      }
    } catch (error) {
      throw wrapDbError("upsert", "Upsert", error);
    }
  }
}

export default KnexSqlUtilities;
