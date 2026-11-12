import type { Knex } from "knex";

// The Trail module (/trail) was removed from qindom. Its tables go with it,
// and the Telegram log toggles for the 'trail' module key are cleared since it
// no longer exists in TelegramLogModules.ts. fndom never called /trail.
//
// down() only recreates the empty tables (schemas copied from
// 20260101000000_initial_schema) — the dropped data isn't recoverable.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_trail_split`);
  await knex.raw(`DROP TABLE IF EXISTS tb_trail_session`);
  await knex.raw(`DROP TABLE IF EXISTS tb_trail_custom`);

  await knex.raw(`DELETE FROM tb_telegram_log_subscription WHERE module_key = 'trail'`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_trail_session (
      id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
      session_id             VARCHAR(36)  NOT NULL,
      created_by_id          BIGINT       NOT NULL,
      trail_id               VARCHAR(100) NOT NULL,
      trail_name             VARCHAR(255) NOT NULL,
      trail_type             ENUM('preset','custom')            NOT NULL DEFAULT 'preset',
      status                 ENUM('active','paused','completed') NOT NULL DEFAULT 'active',
      started_at             BIGINT       NOT NULL,
      completed_at           BIGINT       DEFAULT NULL,
      total_km               DECIMAL(8,3) NOT NULL DEFAULT '0.000',
      total_steps            INT UNSIGNED NOT NULL DEFAULT '0',
      total_duration_seconds INT UNSIGNED NOT NULL DEFAULT '0',
      checkpoints_reached    JSON         DEFAULT NULL,
      track_points           JSON         DEFAULT NULL,
      notes                  TEXT,
      record_status          CHAR(1)      NOT NULL DEFAULT 'A',
      created_dt             BIGINT       NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_trail_session_id (session_id),
      KEY idx_trail_session_by_id (created_by_id),
      CONSTRAINT FK_tb_trail_session_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_trail_split (
      id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      trail_session_id INT UNSIGNED  NOT NULL,
      km_mark          DECIMAL(6,2)  NOT NULL,
      duration_seconds INT UNSIGNED  NOT NULL,
      steps            INT UNSIGNED  DEFAULT NULL,
      lat              DECIMAL(10,7) DEFAULT NULL,
      lng              DECIMAL(10,7) DEFAULT NULL,
      logged_at        BIGINT        NOT NULL,
      record_status    CHAR(1)       NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_split_session (trail_session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_trail_custom (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
      trail_id       VARCHAR(36)  NOT NULL,
      created_by_id  BIGINT       NOT NULL,
      name           VARCHAR(255) NOT NULL,
      country        VARCHAR(100) NOT NULL DEFAULT 'Custom',
      total_km       DECIMAL(8,3) NOT NULL,
      difficulty     ENUM('easy','moderate','hard','extreme') NOT NULL DEFAULT 'moderate',
      estimated_days INT UNSIGNED NOT NULL DEFAULT '1',
      description    TEXT         DEFAULT NULL,
      record_status  CHAR(1)      NOT NULL DEFAULT 'A',
      created_dt     BIGINT       NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_trail_custom_id (trail_id),
      KEY idx_custom_by_id (created_by_id),
      CONSTRAINT FK_tb_trail_custom_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
