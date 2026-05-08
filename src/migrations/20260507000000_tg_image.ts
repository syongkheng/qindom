import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE tb_tg_image (
      id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
      short_code       VARCHAR(16)  NOT NULL,
      telegram_file_id VARCHAR(256) NOT NULL,
      mime_type        VARCHAR(128),
      file_name        VARCHAR(512),
      size_in_bytes    BIGINT,
      created_dt       BIGINT       NOT NULL,
      record_status    CHAR(1)      NOT NULL DEFAULT 'A',
      UNIQUE KEY uq_tg_image_short_code (short_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_tg_image`);
}
