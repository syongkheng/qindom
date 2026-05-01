import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_telegram_link
      ADD COLUMN dm_chat_id BIGINT NULL AFTER telegram_username
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_telegram_link
      DROP COLUMN dm_chat_id
  `);
}
