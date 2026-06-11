import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_marketplace_message
      ADD COLUMN cost_cents INT NOT NULL DEFAULT 0 AFTER tokens_out
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_marketplace_message
      DROP COLUMN IF EXISTS cost_cents
  `);
}
