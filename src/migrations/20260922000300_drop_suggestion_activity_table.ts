import type { Knex } from "knex";

// Trip Recommendation feature removed (admin curation UI + the "explore the
// map" Things-to-do suggestion pins in the Travel Planner).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_suggestion_activity`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_suggestion_activity (
      id              BIGINT        NOT NULL AUTO_INCREMENT,
      destination_tag VARCHAR(255)  NOT NULL,
      title           VARCHAR(255)  NOT NULL,
      category        VARCHAR(64)   NULL,
      estimated_hours DECIMAL(4,1)  NULL,
      description     TEXT          NULL,
      images_json     TEXT          NULL,
      record_status   CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt      BIGINT        NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_suggestion_activity_dest (destination_tag)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
