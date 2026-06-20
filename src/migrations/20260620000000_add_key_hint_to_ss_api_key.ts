import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_ss_api_key ADD COLUMN key_hint VARCHAR(10) NULL AFTER api_key_hash`);
  // Invalidate all existing records — they stored raw values, not SHA-256 hashes
  await knex.raw(`UPDATE tb_ss_api_key SET record_status = 'D' WHERE record_status = 'A'`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_ss_api_key DROP COLUMN key_hint`);
}
