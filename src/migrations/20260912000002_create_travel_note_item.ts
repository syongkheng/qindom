import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_note_item (
      id             BIGINT        NOT NULL AUTO_INCREMENT,
      itinerary_id   BIGINT        NOT NULL,
      label          VARCHAR(255)  NOT NULL,
      category       VARCHAR(64)   NULL,
      url            VARCHAR(512)  NULL,
      done           TINYINT(1)    NOT NULL DEFAULT 0,
      sort_order     INT           NOT NULL DEFAULT 0,
      created_dt     BIGINT        NOT NULL,
      record_status  CHAR(1)       NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      INDEX idx_travel_note_item_itinerary (itinerary_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_travel_note_item`);
}
