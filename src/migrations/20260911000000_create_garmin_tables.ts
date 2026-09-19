import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Single-row cache of the Garmin Connect oauth1/oauth2 token pair so the
  // scheduler doesn't log in on every poll — repeated logins are what trip
  // Garmin's bot detection on the unofficial API. `token_data_json` follows
  // the existing convention of storing JSON as a string column (see
  // tb_geocode_cache.results_json / tb_aa_user.roles) rather than a native
  // MySQL JSON column.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_garmin_session (
      id                 BIGINT       NOT NULL AUTO_INCREMENT,
      provider           VARCHAR(20)  NOT NULL DEFAULT 'garmin',
      token_data_json     TEXT         NOT NULL,
      created_dt         BIGINT       NOT NULL,
      updated_dt         BIGINT       NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_garmin_session_provider (provider)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_garmin_intraday_metric (
      id             BIGINT       NOT NULL AUTO_INCREMENT,
      recorded_dt    BIGINT       NOT NULL,
      stress_score   SMALLINT     DEFAULT NULL,
      body_battery   SMALLINT     DEFAULT NULL,
      heart_rate     SMALLINT     DEFAULT NULL,
      created_dt     BIGINT       NOT NULL,
      record_status  VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_garmin_intraday_recorded_dt (recorded_dt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_garmin_daily_summary (
      id                    BIGINT       NOT NULL AUTO_INCREMENT,
      summary_date          DATE         NOT NULL,
      sleep_score           SMALLINT     DEFAULT NULL,
      sleep_duration_min    INT          DEFAULT NULL,
      deep_sleep_min        INT          DEFAULT NULL,
      light_sleep_min       INT          DEFAULT NULL,
      rem_sleep_min         INT          DEFAULT NULL,
      awake_min             INT          DEFAULT NULL,
      avg_stress            SMALLINT     DEFAULT NULL,
      max_stress            SMALLINT     DEFAULT NULL,
      high_stress_minutes   INT          NOT NULL DEFAULT 0,
      high_stress_windows_json TEXT      DEFAULT NULL,
      min_body_battery      SMALLINT     DEFAULT NULL,
      resting_hr            SMALLINT     DEFAULT NULL,
      created_dt            BIGINT       NOT NULL,
      updated_dt            BIGINT       NOT NULL,
      record_status         VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_garmin_daily_summary_date (summary_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_garmin_daily_summary`);
  await knex.raw(`DROP TABLE IF EXISTS tb_garmin_intraday_metric`);
  await knex.raw(`DROP TABLE IF EXISTS tb_garmin_session`);
}
