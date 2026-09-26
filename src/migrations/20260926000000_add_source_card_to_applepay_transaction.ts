import type { Knex } from "knex";

// Supports the V2 "forward bank transaction email" Siri Shortcut alongside
// the existing V1 "When Apple Pay is used" automation (see
// src/siri-shortcut/ApplePay.v2.controller.ts). V2 has no Apple Pay device
// `name` to report but does carry the bank card's last 4 digits, so `name`
// is relaxed to nullable and `card_last4` is added; `source` distinguishes
// which automation produced a given row so both can coexist in one table.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_applepay_transaction
    MODIFY COLUMN name VARCHAR(255) NULL,
    ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'v1' AFTER name,
    ADD COLUMN card_last4 VARCHAR(4) NULL AFTER source
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_applepay_transaction
    DROP COLUMN card_last4,
    DROP COLUMN source,
    MODIFY COLUMN name VARCHAR(255) NOT NULL
  `);
}
