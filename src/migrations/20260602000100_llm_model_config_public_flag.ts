import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_marketplace_model_config
      ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_marketplace_model_config DROP COLUMN IF EXISTS is_public`);
}
