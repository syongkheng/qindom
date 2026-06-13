import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_telegram_link");
  await knex.schema.dropTableIfExists("tb_telegram_link_token");
  await knex.schema.dropTableIfExists("tb_telegram_media");
}

export async function down(knex: Knex): Promise<void> {
  // ── Telegram Media Storage ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_telegram_link (
      telegram_user_id  BIGINT        NOT NULL,
      username          VARCHAR(100)  NOT NULL,
      telegram_username VARCHAR(100)  NULL,
      linked_dt         BIGINT        NOT NULL,
      record_status     VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (telegram_user_id),
      KEY idx_tg_link_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_telegram_media (
      id               VARCHAR(10)   NOT NULL,
      telegram_file_id VARCHAR(255)  NOT NULL,
      file_type        ENUM('photo','video','document','audio','voice','animation') NOT NULL,
      file_name        VARCHAR(255)  NULL,
      file_size        INT           NULL,
      owner_username   VARCHAR(100)  NOT NULL,
      telegram_user_id BIGINT        NOT NULL,
      created_dt       BIGINT        NOT NULL,
      expires_dt       BIGINT        NULL,
      record_status    VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_tg_media_owner (owner_username),
      KEY idx_tg_media_created (created_dt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_telegram_link_token (
      token      VARCHAR(10)   NOT NULL,
      username   VARCHAR(100)  NOT NULL,
      created_dt BIGINT        NOT NULL,
      PRIMARY KEY (token),
      KEY idx_tg_token_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
