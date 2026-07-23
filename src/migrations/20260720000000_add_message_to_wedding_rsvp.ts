import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("tb_wedding_rsvp", "message");
  if (!hasColumn) {
    await knex.raw(`
      ALTER TABLE tb_wedding_rsvp
      ADD COLUMN message VARCHAR(1000) NULL AFTER meal_preference
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_wedding_rsvp DROP COLUMN message`);
}
