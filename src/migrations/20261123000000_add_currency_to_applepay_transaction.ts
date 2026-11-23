import type { Knex } from "knex";

// Bank alerts can be in foreign currencies (e.g. CNY when spending in China),
// and the dashboard groups totals/pie charts per currency instead of
// converting. Existing rows were all recorded without a currency, so they
// default to SGD (the home currency).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_applepay_transaction
    ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'SGD' AFTER amount
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_applepay_transaction
    DROP COLUMN currency
  `);
}
