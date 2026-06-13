import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_wedding_date_comment");
  await knex.schema.dropTableIfExists("tb_wedding_date");
  await knex.schema.dropTableIfExists("tb_wedding_event");
  await knex.schema.dropTableIfExists("tb_wedding_guest");
  await knex.schema.dropTableIfExists("tb_wedding_session");
  await knex.schema.dropTableIfExists("tb_wedding_table");
}

export async function down(knex: Knex): Promise<void> {
  // ── Wedding Date Picker ────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_session (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      short_code    VARCHAR(16)  NOT NULL,
      title         VARCHAR(255) NOT NULL,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      UNIQUE KEY uq_wedding_short_code (short_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_date (
      id               BIGINT       PRIMARY KEY AUTO_INCREMENT,
      session_id       BIGINT       NOT NULL,
      date             VARCHAR(10)  NOT NULL,
      ceremony_type    VARCHAR(64)  NOT NULL,
      auspicious_notes TEXT         NULL,
      status           VARCHAR(16)  NOT NULL DEFAULT 'pending',
      created_by       VARCHAR(128) NOT NULL,
      created_dt       BIGINT       NOT NULL,
      record_status    VARCHAR(1)   NOT NULL DEFAULT 'A',
      CONSTRAINT fk_wd_session FOREIGN KEY (session_id) REFERENCES tb_wedding_session(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_date_comment (
      id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
      date_id        BIGINT       NOT NULL,
      commenter_name VARCHAR(128) NOT NULL,
      comment        TEXT         NOT NULL,
      created_by     VARCHAR(128) NOT NULL,
      created_dt     BIGINT       NOT NULL,
      record_status  VARCHAR(1)   NOT NULL DEFAULT 'A',
      CONSTRAINT fk_wdc_date FOREIGN KEY (date_id) REFERENCES tb_wedding_date(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Wedding Planner — Events, Tables, Guests ───────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_event (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      title         VARCHAR(255) NOT NULL,
      date          VARCHAR(10)  NOT NULL,
      category      VARCHAR(32)  NOT NULL DEFAULT 'other',
      status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
      notes         TEXT         NULL,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_table (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      name          VARCHAR(128) NOT NULL,
      capacity      INT          NOT NULL DEFAULT 8,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_guest (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      name          VARCHAR(128) NOT NULL,
      guest_group   VARCHAR(16)  NOT NULL DEFAULT 'mutual',
      rsvp          VARCHAR(16)  NOT NULL DEFAULT 'pending',
      plus_one      TINYINT(1)   NOT NULL DEFAULT 0,
      dietary_notes TEXT         NULL,
      table_id      BIGINT       NULL,
      seat_number   INT          NULL,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
