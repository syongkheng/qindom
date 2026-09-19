import type { Knex } from "knex";

// Admin-curated "Places to visit" — distinct from the live OpenStreetMap
// Overpass lookup (src/places/Places.service.ts), which has no persistent,
// editable record per POI. Curated rows are merged into the /api/places
// response so an admin can enrich the live results with a description and
// images; Overpass fills in everything the admin hasn't curated yet.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_suggestion_place (
      id              BIGINT        NOT NULL AUTO_INCREMENT,
      destination_tag VARCHAR(255)  NOT NULL,
      title           VARCHAR(255)  NOT NULL,
      category        VARCHAR(64)   NULL,
      description     TEXT          NULL,
      images_json     TEXT          NULL,
      lat             DECIMAL(10,7) NOT NULL,
      lng             DECIMAL(10,7) NOT NULL,
      record_status   CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt      BIGINT        NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_suggestion_place_dest (destination_tag)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_suggestion_place`);
}
