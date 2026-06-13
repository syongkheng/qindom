import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_fnd_event");
  await knex.schema.dropTableIfExists("tb_fnd_event_view");
  await knex.schema.dropTableIfExists("tb_fnd_kop_appt");
  await knex.schema.dropTableIfExists("tb_fnd_notice");
  await knex.schema.dropTableIfExists("tb_fnd_notice_view");
}

export async function down(knex: Knex): Promise<void> {
  // ── FND (Notices & Events) ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_fnd_notice (
      id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
      type           VARCHAR(16),
      title          VARCHAR(512),
      content        VARCHAR(8192),
      classification VARCHAR(16),
      updated_by     VARCHAR(64),
      updated_dt     BIGINT,
      created_by     VARCHAR(64),
      created_dt     BIGINT,
      record_status  VARCHAR(1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_fnd_notice_view (
      id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
      notice_id  BIGINT,
      username   VARCHAR(64),
      created_dt BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_fnd_event (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      event_dt      BIGINT,
      title         VARCHAR(512),
      content       VARCHAR(8192),
      updated_by    VARCHAR(64),
      updated_dt    BIGINT,
      created_by    VARCHAR(64),
      created_dt    BIGINT,
      record_status VARCHAR(1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_fnd_event_view (
      id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
      event_id   BIGINT,
      username   VARCHAR(64),
      created_dt BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
