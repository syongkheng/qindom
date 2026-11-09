import type { Knex } from "knex";

// Saved house-planner layouts. `data` is the planner's own export JSON (placed furniture, custom
// pieces, edited walls) stored as text; the server validates its shape and size but never edits it.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_house_layout (
      id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      uuid          VARCHAR(36)   NOT NULL,
      name          VARCHAR(100)  NOT NULL,
      data          MEDIUMTEXT    NOT NULL,
      item_count    INT UNSIGNED  NOT NULL DEFAULT 0,
      record_status CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt    BIGINT        NOT NULL,
      created_by_id BIGINT        NOT NULL,
      updated_dt    BIGINT        DEFAULT NULL,
      updated_by_id BIGINT        DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_house_layout_uuid (uuid),
      KEY idx_house_layout_user (created_by_id, record_status, updated_dt),
      CONSTRAINT FK_tb_house_layout_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_house_layout");
}
