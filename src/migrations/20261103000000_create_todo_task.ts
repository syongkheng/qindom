import type { Knex } from "knex";

// Personal to-do list. One row per task; `uuid` is the public id (the auto-increment
// id never leaves the server). sort_order is the manual order (lower = higher up);
// done tasks keep their slot so un-checking puts them back where they were.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_todo_task (
      id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      uuid          VARCHAR(36)   NOT NULL,
      title         VARCHAR(500)  NOT NULL,
      done          TINYINT(1)    NOT NULL DEFAULT 0,
      done_dt       BIGINT        DEFAULT NULL,
      pinned        TINYINT(1)    NOT NULL DEFAULT 0,
      sort_order    DOUBLE        NOT NULL DEFAULT 0,
      record_status CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt    BIGINT        NOT NULL,
      created_by_id BIGINT        NOT NULL,
      updated_dt    BIGINT        DEFAULT NULL,
      updated_by_id BIGINT        DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_todo_task_uuid (uuid),
      KEY idx_todo_task_user (created_by_id, record_status, sort_order),
      CONSTRAINT FK_tb_todo_task_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_todo_task");
}
