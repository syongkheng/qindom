import type { Knex } from "knex";
import dotenv from "dotenv";

dotenv.config();

const config: Knex.Config = {
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
    directory: "./src/migrations",
    extension: "ts",
  },
};

export default config;
