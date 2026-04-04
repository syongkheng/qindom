import knex from "knex";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

// Standalone migration runner — used during EC2 deploys.
// Runs all pending migrations then exits. Extension is always 'js' here
// because this script only runs as compiled output on the server.
const k = knex({
  client: "mysql2",
  connection: {
    host: process.env.DB_URL,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME,
    port: 3306,
  },
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
