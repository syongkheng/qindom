import type { Knex } from "knex";

/** Knex client shared by the app (`config/db/mysql.ts`), `src/migrate.ts` and the root `knexfile.ts`. */
export const DB_CLIENT = "mysql2";
export const DB_PORT = 3306;

/**
 * MySQL connection settings from the loaded env (`DB_URL`, `DB_USER`, `DB_PW`, `DB_NAME`). Read on call,
 * never at import, so it always sees whatever env file the entry point loaded. A missing `DB_URL` throws
 * instead of letting mysql2 fall back to `localhost` (tests load no env file, so a stray query fails loudly).
 */
export function readDbConnection(): Knex.MySql2ConnectionConfig {
  const host = process.env.DB_URL;
  if (!host) throw new Error("DB_URL is not set");
  return {
    host,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME,
    port: DB_PORT,
  };
}
