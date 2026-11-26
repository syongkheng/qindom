/**
 * Config for the knex CLI scripts (`npm run migrate`, `migrate:rollback`, `migrate:make`, `migrate:status`).
 *
 * Env: plain `dotenv.config()` = `.env` in the working directory (the PROD database), never `.env.dev`,
 * and without override (variables already set in the shell win). Deliberate: migrations are applied to
 * prod from here (deploy.sh also runs them on EC2 via `src/migrate.js`). See src/config/README.md.
 */
import type { Knex } from "knex";
import dotenv from "dotenv";
import { DB_CLIENT, readDbConnection } from "./src/config/db/connection.js";

dotenv.config();

const POOL_MIN = 2;
const POOL_MAX = 10;

const config: Knex.Config = {
  client: DB_CLIENT,
  connection: readDbConnection(), // after dotenv.config() above
  pool: { min: POOL_MIN, max: POOL_MAX },
  migrations: {
    directory: "./src/migrations",
    extension: "ts",
  },
};

export default config;
