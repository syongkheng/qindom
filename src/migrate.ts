/**
 * Standalone migration runner for EC2 deploys: deploy.sh runs `node src/migrate.js` (compiled) from the
 * project root before restarting PM2. Applies every pending migration, then exits (non-zero on failure).
 *
 * Env: plain `dotenv.config()` = `.env` in the working directory, never `.env.dev`, and without override
 * (variables already set in the shell win). On EC2 that `.env` is the prod one deploy.sh copies over.
 * Deliberate; see config/README.md. Extension is always "js": this only runs as compiled output.
 */
import knex from "knex";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { DB_CLIENT, readDbConnection } from "./config/db/connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const k = knex({
  client: DB_CLIENT,
  connection: readDbConnection(), // after dotenv.config() above
  migrations: {
    directory: path.join(__dirname, "migrations"),
    extension: "js",
  },
});

k.migrate
  .latest()
  .then(([batch, files]: [number, string[]]) => {
    if (files.length === 0) {
      console.log("No pending migrations.");
    } else {
      console.log(`Batch ${batch} — applied ${files.length} migration(s):`);
      files.forEach((f) => console.log(`  ✓ ${path.basename(f)}`));
    }
    return k.destroy();
  })
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
