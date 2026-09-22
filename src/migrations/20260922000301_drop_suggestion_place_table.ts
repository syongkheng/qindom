import type { Knex } from "knex";

// Trip Recommendation feature removed (admin curation UI + the "explore the
// map" Places-to-visit suggestion pins in the Travel Planner).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_suggestion_place`);
}

export async function down(knex: Knex): Promise<void> {
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
