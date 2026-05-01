import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE tb_trail_session (
      id                      INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      session_id              VARCHAR(36)  NOT NULL,
      created_by              VARCHAR(255) NOT NULL,
      trail_id                VARCHAR(100) NOT NULL,
      trail_name              VARCHAR(255) NOT NULL,
      trail_type              ENUM('preset','custom') NOT NULL DEFAULT 'preset',
      status                  ENUM('active','paused','completed') NOT NULL DEFAULT 'active',
      started_at              BIGINT NOT NULL,
      completed_at            BIGINT NULL,
      total_km                DECIMAL(8,3) NOT NULL DEFAULT 0,
      total_steps             INT UNSIGNED NOT NULL DEFAULT 0,
      total_duration_seconds  INT UNSIGNED NOT NULL DEFAULT 0,
      checkpoints_reached     JSON NULL,
      track_points            JSON NULL,
      notes                   TEXT NULL,
      record_status           CHAR(1) NOT NULL DEFAULT 'A',
      created_dt              BIGINT NOT NULL,
      UNIQUE KEY uq_trail_session_id (session_id),
      INDEX idx_trail_session_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE tb_trail_split (
      id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      trail_session_id   INT UNSIGNED NOT NULL,
      km_mark            DECIMAL(6,2) NOT NULL,
      duration_seconds   INT UNSIGNED NOT NULL,
      steps              INT UNSIGNED NULL,
      lat                DECIMAL(10,7) NULL,
      lng                DECIMAL(10,7) NULL,
      logged_at          BIGINT NOT NULL,
      record_status      CHAR(1) NOT NULL DEFAULT 'A',
      INDEX idx_split_session (trail_session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE tb_trail_custom (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      trail_id       VARCHAR(36)  NOT NULL,
      created_by     VARCHAR(255) NOT NULL,
      name           VARCHAR(255) NOT NULL,
      country        VARCHAR(100) NOT NULL DEFAULT 'Custom',
      total_km       DECIMAL(8,3) NOT NULL,
      difficulty     ENUM('easy','moderate','hard','extreme') NOT NULL DEFAULT 'moderate',
      estimated_days INT UNSIGNED NOT NULL DEFAULT 1,
      description    TEXT NULL,
      record_status  CHAR(1) NOT NULL DEFAULT 'A',
      created_dt     BIGINT NOT NULL,
      UNIQUE KEY uq_trail_custom_id (trail_id),
      INDEX idx_custom_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_trail_split`);
  await knex.raw(`DROP TABLE IF EXISTS tb_trail_session`);
  await knex.raw(`DROP TABLE IF EXISTS tb_trail_custom`);
}
