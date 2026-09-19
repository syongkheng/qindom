import type { Knex } from "knex";

// Discriminates "Things to do" from "Places to visit" agenda items now that
// both can carry coordinates (previously the split relied on coordinate
// presence alone, which broke once Things-to-do items also got geocoded for
// map display — see TravelPlannerView.vue). Nullable: existing/manual rows
// have no value and are treated as "todo" by the frontend's fallback.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_travel_agenda_item
    ADD COLUMN list_type VARCHAR(16) NULL AFTER category
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_travel_agenda_item DROP COLUMN list_type`);
}
