import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_telegram_log_subscription (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      chat_id       BIGINT       NOT NULL,
      module_key    VARCHAR(64)  NOT NULL,
      is_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
      updated_dt    BIGINT       DEFAULT NULL,
      updated_by_id BIGINT       DEFAULT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_telegram_log_sub_chat_module (chat_id, module_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_telegram_log_subscription");
}
