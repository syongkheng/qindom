import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_applepay_transaction
    ADD COLUMN uuid VARCHAR(36) NULL AFTER id,
    ADD COLUMN category VARCHAR(64) NULL AFTER name,
    ADD UNIQUE KEY uq_applepay_transaction_uuid (uuid)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_applepay_transaction
    DROP KEY uq_applepay_transaction_uuid,
    DROP COLUMN uuid,
    DROP COLUMN category
  `);
}
