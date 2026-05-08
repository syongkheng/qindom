import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE tb_tg_stats_whitelist (
      id               BIGINT  NOT NULL AUTO_INCREMENT PRIMARY KEY,
      telegram_user_id BIGINT  NOT NULL,
      added_dt         BIGINT  NOT NULL,
      record_status    CHAR(1) NOT NULL DEFAULT 'A',
      UNIQUE KEY uq_tg_stats_wl_user (telegram_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_tg_stats_whitelist`);
}
