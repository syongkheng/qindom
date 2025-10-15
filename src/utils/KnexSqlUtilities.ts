import { Knex } from "knex";

class KnexSqlUtilities {
  constructor(private knex: Knex) {}

  // CREATE
  async insert<T = any, R = T>(table: string, data: Partial<T>): Promise<R> {
    try {
      const [id] = await this.knex(table).insert(data);
      // Fetch the inserted row manually if needed
      const [row] = await this.knex(table).where({ id }).select("*");
      return row as R;
    } catch (error: any) {
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
      return (await this.knex(table)
        .select(columns)
        .where(whereClause)
        .first()) as T | undefined;
    } catch (error: any) {
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
    } = {}
  ): Promise<T[]> {
    try {
      let query = this.knex(table).where(whereClause);

      if (options.limit) query = query.limit(options.limit);
      if (options.offset) query = query.offset(options.offset);
      if (options.orderBy)
        query = query.orderBy(options.orderBy, options.orderDirection || "asc");

      query = options.columns
        ? query.select(options.columns)
        : query.select("*");

      return (await query) as T[];
    } catch (error: any) {
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
      await this.knex(table).where(whereClause).update(data);
      const rows = await this.knex(table).where(whereClause).select("*");
      return rows as R[];
    } catch (error: any) {
      throw new Error(`Update failed: ${error.message}`);
    }
  }

  // DELETE
  async delete<T = any>(
    table: string,
    whereClause: Partial<T>
  ): Promise<number> {
    try {
      const result = await this.knex(table).where(whereClause).delete();
      return result; // returns number of deleted rows
    } catch (error: any) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  // RAW
  async raw<T = any>(sql: string, bindings: any[] = []): Promise<T> {
    try {
      const [rows] = await this.knex.raw(sql, bindings);
      return rows as T;
    } catch (error: any) {
      throw new Error(`Raw query failed: ${error.message}`);
    }
  }

  // TRANSACTION
  async transaction<T = any>(
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    try {
      return await this.knex.transaction(callback);
    } catch (error: any) {
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }

  // COUNT
  async count<T = any>(
    table: string,
    whereClause: Partial<T> = {}
  ): Promise<number> {
    try {
      const result = await this.knex(table)
        .where(whereClause)
        .count<{ count: number }[]>({ count: "*" });
      return Number(result[0]?.count || 0);
    } catch (error: any) {
      throw new Error(`Count failed: ${error.message}`);
    }
  }
}

export default KnexSqlUtilities;
