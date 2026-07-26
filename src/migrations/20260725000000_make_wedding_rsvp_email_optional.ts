import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_wedding_rsvp
    MODIFY COLUMN email VARCHAR(255) NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_wedding_rsvp
    MODIFY COLUMN email VARCHAR(255) NOT NULL
  `);
}
