import type { Knex } from "knex";

// /api/places (Overpass live-lookup, merged with tb_suggestion_place) removed
// along with the Trip Recommendation feature -- this cache table only ever
// served that route.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_place_cache`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_place_cache (
      id            BIGINT        NOT NULL AUTO_INCREMENT,
      lat_rounded   DECIMAL(9,5)  NOT NULL,
      lng_rounded   DECIMAL(9,5)  NOT NULL,
      radius_m      INT           NOT NULL,
      results_json  TEXT          NOT NULL,
      created_dt    BIGINT        NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_place_cache_coords (lat_rounded, lng_rounded, radius_m)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
