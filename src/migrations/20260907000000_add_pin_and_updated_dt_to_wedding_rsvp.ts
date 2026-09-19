import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_wedding_rsvp
    ADD COLUMN pin CHAR(4) NULL AFTER id,
    ADD COLUMN updated_dt BIGINT NULL AFTER created_dt
  `);

  // Backfill existing rows with a unique random 4-digit pin (there's no
  // reasonable value to derive one from), and seed updated_dt from
  // created_dt so historical rows don't read as "just updated".
  const existingRows: { id: number }[] = await knex("tb_wedding_rsvp").select("id");
  const usedPins = new Set<string>();

  for (const row of existingRows) {
    let pin: string;
    do {
      pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    } while (usedPins.has(pin));
    usedPins.add(pin);

    await knex("tb_wedding_rsvp").where({ id: row.id }).update({ pin });
  }

  await knex.raw(`UPDATE tb_wedding_rsvp SET updated_dt = created_dt WHERE updated_dt IS NULL`);

  await knex.raw(`
    ALTER TABLE tb_wedding_rsvp
    MODIFY COLUMN pin CHAR(4) NOT NULL,
    MODIFY COLUMN updated_dt BIGINT NOT NULL,
    ADD UNIQUE KEY uq_wedding_rsvp_pin (pin)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_wedding_rsvp
    DROP KEY uq_wedding_rsvp_pin,
    DROP COLUMN pin,
    DROP COLUMN updated_dt
  `);
}
