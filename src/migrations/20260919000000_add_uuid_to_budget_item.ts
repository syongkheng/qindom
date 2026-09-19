import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_budget_item
    ADD COLUMN uuid VARCHAR(36) NULL AFTER id,
    ADD UNIQUE KEY uq_budget_item_uuid (uuid)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_budget_item DROP KEY uq_budget_item_uuid, DROP COLUMN uuid`);
}
