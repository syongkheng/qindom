import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_tg_image ADD COLUMN uuid VARCHAR(36) NULL AFTER short_code`);
  await knex.raw(`ALTER TABLE tb_tg_image ADD UNIQUE KEY uq_tg_image_uuid (uuid)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_tg_image DROP KEY uq_tg_image_uuid`);
  await knex.raw(`ALTER TABLE tb_tg_image DROP COLUMN uuid`);
}
