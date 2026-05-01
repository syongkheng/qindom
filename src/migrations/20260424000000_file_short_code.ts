import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_travel_agenda_file
      ADD COLUMN short_code VARCHAR(16) NULL AFTER uuid,
      ADD UNIQUE INDEX idx_short_code (short_code)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_travel_agenda_file
      DROP INDEX idx_short_code,
      DROP COLUMN short_code
  `);
}
