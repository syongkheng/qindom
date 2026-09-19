import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_budget_table (
      id             BIGINT        NOT NULL AUTO_INCREMENT,
      session_id     VARCHAR(64)   NOT NULL,
      name           VARCHAR(255)  NOT NULL,
      created_dt     BIGINT        NOT NULL,
      created_by_id  BIGINT        NOT NULL,
      record_status  CHAR(1)       NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_budget_table_session (session_id),
      INDEX idx_budget_table_created_by (created_by_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_budget_item (
      id             BIGINT        NOT NULL AUTO_INCREMENT,
      table_id       BIGINT        NOT NULL,
      name           VARCHAR(255)  NOT NULL,
      category       VARCHAR(64)   NULL,
      status         VARCHAR(16)   NOT NULL DEFAULT 'to_buy',
      budget_amount  DECIMAL(12,2) NULL,
      actual_amount  DECIMAL(12,2) NULL,
      notes          VARCHAR(1024) NULL,
      sort_order     INT           NOT NULL DEFAULT 0,
      created_dt     BIGINT        NOT NULL,
      created_by_id  BIGINT        NOT NULL,
      record_status  CHAR(1)       NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      INDEX idx_budget_item_table (table_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_budget_collaborator (
      id             BIGINT        NOT NULL AUTO_INCREMENT,
      table_id       BIGINT        NOT NULL,
      user_id        BIGINT        NOT NULL,
      added_by_id    BIGINT        NOT NULL,
      created_dt     BIGINT        NOT NULL,
      record_status  CHAR(1)       NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_budget_collaborator (table_id, user_id),
      INDEX idx_budget_collaborator_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_budget_collaborator`);
  await knex.raw(`DROP TABLE IF EXISTS tb_budget_item`);
  await knex.raw(`DROP TABLE IF EXISTS tb_budget_table`);
}
