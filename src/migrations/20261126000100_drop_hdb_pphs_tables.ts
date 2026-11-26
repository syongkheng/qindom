import type { Knex } from "knex";

// The HDB PPHS module (/hdb) was removed from qindom and fndom (it could no longer scrape the
// HDB page and nobody used it). Its two tables go with it, and the Telegram log toggles for the
// 'hdb' module key are cleared since it no longer exists in TelegramLogModules.ts. The nearby bus
// stop / MRT lookups it also served moved to /lta (their tables are LTA's and stay).
//
// No foreign key links the two tables; the coordinate cache is dropped first anyway.
// down() only recreates the empty tables (schemas copied from 20260101000000_initial_schema,
// never altered since) — the dropped data isn't recoverable.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_hdb_pphs_coordinate`);
  await knex.raw(`DROP TABLE IF EXISTS tb_hdb_pphs`);

  await knex.raw(`DELETE FROM tb_telegram_log_subscription WHERE module_key = 'hdb'`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_hdb_pphs (
      id          BIGINT      NOT NULL AUTO_INCREMENT,
      batch       VARCHAR(6)  NOT NULL,
      json_string LONGTEXT    NOT NULL,
      created_dt  BIGINT      NOT NULL,
      created_by  VARCHAR(64) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY batch (batch)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_hdb_pphs_coordinate (
      id          BIGINT        NOT NULL AUTO_INCREMENT,
      building    VARCHAR(1024) DEFAULT NULL,
      formed_url  VARCHAR(1024) DEFAULT NULL,
      lat         VARCHAR(16)   DEFAULT NULL,
      lng         VARCHAR(16)   DEFAULT NULL,
      created_dt  BIGINT        NOT NULL,
      created_by  VARCHAR(64)   NOT NULL,
      modified_dt BIGINT        DEFAULT NULL,
      modified_by VARCHAR(64)   DEFAULT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
