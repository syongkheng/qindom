import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_budget_table
    ADD COLUMN template VARCHAR(32) NOT NULL DEFAULT 'other' AFTER name
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_budget_table DROP COLUMN template`);
}
