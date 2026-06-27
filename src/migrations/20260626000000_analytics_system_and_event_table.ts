import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Drop and recreate tb_analytic_user_activity with the system column.
  // Note: `system` is a MySQL reserved word and must be backtick-quoted.
  await knex.raw(`DROP TABLE IF EXISTS tb_analytic_user_activity`);
  await knex.raw(`
    CREATE TABLE tb_analytic_user_activity (
      session_id   VARCHAR(64)  NOT NULL,
      user_id      VARCHAR(64)  NULL,
      last_seen_at BIGINT       NOT NULL,
      ip_address   VARCHAR(45)  NULL,
      user_agent   TEXT         NULL,
      \`system\`   VARCHAR(64)  NULL,
      PRIMARY KEY (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_analytic_event (
      id          BIGINT        NOT NULL AUTO_INCREMENT,
      event       VARCHAR(64)   NOT NULL,
      properties  LONGTEXT      NULL,
      page        VARCHAR(512)  NULL,
      referrer    VARCHAR(512)  NULL,
      session_id  VARCHAR(64)   NOT NULL,
      user_id     VARCHAR(64)   NULL,
      ip_address  VARCHAR(45)   NULL,
      user_agent  TEXT          NULL,
      \`system\`  VARCHAR(64)   NOT NULL,
      created_at  BIGINT        NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_analytic_event_session (session_id),
      INDEX idx_analytic_event_system  (\`system\`),
      INDEX idx_analytic_event_event   (event),
      INDEX idx_analytic_event_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_analytic_event`);
  await knex.raw(`DROP TABLE IF EXISTS tb_analytic_user_activity`);
}
