import type { Knex } from "knex";

const P = "travel.suggestion.packing.items";

const LABEL_KEY_MAP: Record<string, string> = {
  "Umbrella":                  `${P}.umbrella`,
  "Sunscreen SPF 50":          `${P}.sunscreen`,
  "Comfortable walking shoes": `${P}.walkingShoes`,
  "Light breathable clothing": `${P}.breathableClothing`,
  "Sunglasses":                `${P}.sunglasses`,
  "Mosquito repellent":        `${P}.mosquitoRepellent`,
  "Portable charger":          `${P}.portableCharger`,
  "Travel adaptor":            `${P}.travelAdaptor`,
  "Camera":                    `${P}.camera`,
  "Reusable water bottle":     `${P}.waterBottle`,
  "Collapsible tote bag":      `${P}.toteBag`,
  "Hand sanitiser":            `${P}.handSanitiser`,
  "Wet wipes":                 `${P}.wetWipes`,
  "Passport / travel docs":    `${P}.passport`,
  "Emergency cash":            `${P}.emergencyCash`,
};

export async function up(knex: Knex): Promise<void> {
  // tb_suggestion_packing may already have this column if
  // 20260705000000_create_suggestion_tables ran with it baked in.
  const hasColumn = await knex.schema.hasColumn("tb_suggestion_packing", "label_key");
  if (!hasColumn) {
    await knex.raw(`
      ALTER TABLE tb_suggestion_packing
      ADD COLUMN label_key VARCHAR(128) NULL AFTER label
    `);
  }

  for (const [label, key] of Object.entries(LABEL_KEY_MAP)) {
    await knex("tb_suggestion_packing")
      .where({ label, record_status: "A" })
      .update({ label_key: key });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_suggestion_packing DROP COLUMN label_key`);
}
