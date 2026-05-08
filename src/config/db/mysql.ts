import knex from "knex";
import { Knex } from "knex";
import dotenv from "dotenv";
import path from "path";
import KnexSqlUtilities from "../../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../../utils/logging/LoggingUtilities";

// Load environment variables from .env file
dotenv.config();

// Define Knex configuration
const dbConfig: Knex.Config = {
  client: "mysql2",
  connection: {
    host: process.env.DB_URL,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME,
    port: 3306,
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    // __dirname is src/config/db in dev (ts-node) and config/db in prod (compiled JS).
    // Two levels up lands at src/ in dev and the project root in prod — then into migrations/.
    directory: path.join(__dirname, "../../migrations"),
    extension: __filename.endsWith(".ts") ? "ts" : "js",
  },
};

// Initialize Knex with the configuration
const knexInstance = knex(dbConfig);
const db = new KnexSqlUtilities(knexInstance);

// Test connection and log status
export async function initializeDatabase() {
  try {
    LoggingUtilities.service.info(
      "init_db",
      "Attempting to connect to database..."
    );
    LoggingUtilities.service.info("init_db", `   Host: ${process.env.DB_URL}`);
    LoggingUtilities.service.info(
      "init_db",
      `   Database: ${process.env.DB_NAME}`
    );
    LoggingUtilities.service.info("init_db", `   User: ${process.env.DB_USER}`);

    // Test the connection
    await db.raw("SELECT 1 as connection_test");

    LoggingUtilities.service.info("init_db", "Database connection established");

    // Apply any pending migrations automatically
    await knexInstance.migrate.latest();
    LoggingUtilities.service.info("init_db", "Migrations applied");

    return db;
  } catch (error) {
    LoggingUtilities.service.error("init_db", "Failed to connect to database");
    process.exit(1); // Exit if database connection fails
  }
}

// Export the initialized database after testing connection
export default db;
