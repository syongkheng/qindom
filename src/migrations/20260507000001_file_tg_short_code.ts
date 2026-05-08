import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_travel_agenda_file MODIFY COLUMN \`blob\` LONGBLOB NULL`);
  await knex.raw(`ALTER TABLE tb_travel_agenda_file ADD COLUMN tg_short_code VARCHAR(16) NULL AFTER short_code`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_travel_agenda_file DROP COLUMN tg_short_code`);
  await knex.raw(`ALTER TABLE tb_travel_agenda_file MODIFY COLUMN \`blob\` LONGBLOB NOT NULL`);
}
