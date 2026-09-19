import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_suggestion_activity
    ADD COLUMN images_json TEXT NULL AFTER description
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_suggestion_activity DROP COLUMN images_json`);
}
