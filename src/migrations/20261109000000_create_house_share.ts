import type { Knex } from "knex";

// Public read-only share links for a house layout. `data` is a snapshot of the planner's export JSON taken
// when the link was made (later edits to the planner do not change it); revoking marks the row deleted.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_house_share (
      id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      token         VARCHAR(36)   NOT NULL,
      name          VARCHAR(100)  NOT NULL,
      data          MEDIUMTEXT    NOT NULL,
      item_count    INT UNSIGNED  NOT NULL DEFAULT 0,
      record_status CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt    BIGINT        NOT NULL,
      created_by_id BIGINT        NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_house_share_token (token),
      KEY idx_house_share_user (created_by_id, record_status, created_dt),
      CONSTRAINT FK_tb_house_share_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_house_share");
}
