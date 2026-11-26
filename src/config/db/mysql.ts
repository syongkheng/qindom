import knex, { Knex } from "knex";
import path from "path";
import { fileURLToPath } from "url";
import KnexSqlUtilities from "../../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../../utils/logging/LoggingUtilities.js";
import { toMessage } from "../../utils/ErrorUtilities.js";
import { DB_CLIENT, readDbConnection } from "./connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_TAG = "init_db";
const POOL_MIN = 2;
const POOL_MAX = 10;
const CONNECTION_TEST_SQL = "SELECT 1 as connection_test";
/** Opt-in only, so a prod boot never changes the schema by accident (deploy.sh runs `src/migrate.js` instead). */
const RUN_MIGRATIONS_FLAG = "true";

const dbConfig: Knex.Config = {
  client: DB_CLIENT,
  // A function: knex calls it when it opens the first connection, so the settings come from the env file
  // the entry point loaded, whatever the import order. Importing this module never connects or reads env.
  connection: readDbConnection,
  pool: { min: POOL_MIN, max: POOL_MAX },
  migrations: {
    // __dirname is src/config/db in dev (tsx) and <dist>/src/config/db in prod (compiled JS).
    // Two levels up is src/ either way, then into migrations/.
    directory: path.join(__dirname, "../../migrations"),
    extension: __filename.endsWith(".ts") ? "ts" : "js",
  },
};

const knexInstance = knex(dbConfig);

/** The app's one `KnexSqlUtilities`. Imported directly by the middlewares; controllers get it from index.ts. */
const db = new KnexSqlUtilities(knexInstance);

/**
 * Boot step: logs the connection target, checks it with `SELECT 1`, optionally runs migrations
 * (`RUN_MIGRATIONS=true`) and returns `db`. Any failure exits the process (PM2 restarts it; deploy.sh's
 * health check then fails), so the server never listens without a database.
 */
export async function initializeDatabase(): Promise<KnexSqlUtilities> {
  try {
    // The same function knex uses for the first connection, so the log shows the values actually used.
    const { host, database, user } = readDbConnection();
    LoggingUtilities.service.info(LOG_TAG, "Attempting to connect to database...");
    LoggingUtilities.service.info(LOG_TAG, `   Host: ${host}`);
    LoggingUtilities.service.info(LOG_TAG, `   Database: ${database}`);
    LoggingUtilities.service.info(LOG_TAG, `   User: ${user}`);

    await db.raw(CONNECTION_TEST_SQL);
    LoggingUtilities.service.info(LOG_TAG, "Database connection established");

    if (process.env.RUN_MIGRATIONS === RUN_MIGRATIONS_FLAG) {
      await knexInstance.migrate.latest();
      LoggingUtilities.service.info(LOG_TAG, "Migrations applied");
    } else {
      LoggingUtilities.service.info(LOG_TAG, "Migrations skipped (set RUN_MIGRATIONS=true to apply)");
    }

    return db;
  } catch (error) {
    LoggingUtilities.service.error(LOG_TAG, `Failed to connect to database: ${toMessage(error)}`);
    process.exit(1);
  }
}

export default db;
