import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_packing_item (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      itinerary_id  INT UNSIGNED NOT NULL,
      label         VARCHAR(255) NOT NULL,
      category      VARCHAR(50)  DEFAULT NULL,
      packed        TINYINT(1)   NOT NULL DEFAULT '0',
      quantity      INT          DEFAULT NULL,
      sort_order    INT          NOT NULL DEFAULT '0',
      created_dt    BIGINT       NOT NULL,
      record_status CHAR(1)      NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_packing_itinerary_id (itinerary_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_travel_packing_item");
}
