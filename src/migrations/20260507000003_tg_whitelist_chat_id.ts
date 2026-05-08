import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_tg_stats_whitelist ADD COLUMN telegram_chat_id BIGINT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_tg_stats_whitelist DROP COLUMN telegram_chat_id`);
}
