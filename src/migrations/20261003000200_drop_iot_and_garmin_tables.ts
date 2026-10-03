import type { Knex } from "knex";

// IoT device tracking (/iot, /iot-key) and Garmin health sync (/garmin + its
// node-cron poller) were removed from both qindom and fndom. Their tables go
// with them. The Telegram log toggles for those two module keys are cleared
// too, since the modules no longer exist in TelegramLogModules.ts.
//
// down() only recreates the empty tables (schemas copied from
// 20260815000000_create_iot_tables, 20260816000000_create_iot_coordinate_log
// and 20260911000000_create_garmin_tables) — the dropped data isn't recoverable.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_iot_coordinate_log`);
  await knex.raw(`DROP TABLE IF EXISTS tb_iot_device_heartbeat`);
  await knex.raw(`DROP TABLE IF EXISTS tb_iot_api_key`);

  await knex.raw(`DROP TABLE IF EXISTS tb_garmin_daily_summary`);
  await knex.raw(`DROP TABLE IF EXISTS tb_garmin_intraday_metric`);
  await knex.raw(`DROP TABLE IF EXISTS tb_garmin_session`);

  await knex.raw(`DELETE FROM tb_telegram_log_subscription WHERE module_key IN ('iot', 'garmin')`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_iot_api_key (
      id                 BIGINT       NOT NULL AUTO_INCREMENT,
      user_id            BIGINT       NOT NULL,
      api_key_prefix     VARCHAR(20)  NOT NULL,
      api_key_hash       VARCHAR(255) NOT NULL,
      key_hint           VARCHAR(10)  DEFAULT NULL,
      name               VARCHAR(100) DEFAULT NULL,
      revoked_at         BIGINT       DEFAULT NULL,
      created_dt         BIGINT       NOT NULL,
      created_by_id      BIGINT       NOT NULL,
      updated_dt         BIGINT       DEFAULT NULL,
      updated_by_id      BIGINT       DEFAULT NULL,
      record_status      VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY FK_tb_iot_api_key_user       (user_id),
      KEY FK_tb_iot_api_key_created_by (created_by_id),
      KEY FK_tb_iot_api_key_updated_by (updated_by_id),
      CONSTRAINT FK_tb_iot_api_key_user       FOREIGN KEY (user_id)       REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_iot_api_key_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_iot_api_key_updated_by FOREIGN KEY (updated_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_iot_device_heartbeat (
      device_id     VARCHAR(64)  NOT NULL,
      device_name   VARCHAR(100) DEFAULT NULL,
      ip_address    VARCHAR(45)  DEFAULT NULL,
      user_agent    VARCHAR(255) DEFAULT NULL,
      last_seen_dt  BIGINT       NOT NULL,
      created_dt    BIGINT       NOT NULL,
      PRIMARY KEY (device_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_iot_coordinate_log (
      id           BIGINT       NOT NULL AUTO_INCREMENT,
      device_id    VARCHAR(64)  NOT NULL,
      lat          DOUBLE       DEFAULT NULL,
      lon          DOUBLE       DEFAULT NULL,
      alt          FLOAT        DEFAULT NULL,
      temp         FLOAT        DEFAULT NULL,
      recorded_dt  BIGINT       NOT NULL,
      rssi         INT          DEFAULT NULL,
      chip_temp    FLOAT        DEFAULT NULL,
      uptime_ms    BIGINT       DEFAULT NULL,
      ip_address   VARCHAR(45)  DEFAULT NULL,
      created_dt   BIGINT       NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_iot_coordinate_log_device   (device_id),
      INDEX idx_iot_coordinate_log_recorded (recorded_dt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

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
