import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_sleep_log");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_sleep_log (
      id                      BIGINT       PRIMARY KEY AUTO_INCREMENT,
      date                    VARCHAR(10)  NOT NULL,
      source                  VARCHAR(16)  NOT NULL DEFAULT 'garmin',
      bedtime                 VARCHAR(5)   NULL,
      wake_time               VARCHAR(5)   NULL,
      total_sleep_min         INT          NULL,
      deep_min                INT          NULL,
      light_min               INT          NULL,
      rem_min                 INT          NULL,
      awake_min               INT          NULL,
      deep_pct                TINYINT      NULL,
      light_pct               TINYINT      NULL,
      rem_pct                 TINYINT      NULL,
      resting_hr_bpm          TINYINT      NULL,
      body_battery_change     TINYINT      NULL,
      avg_spo2_pct            TINYINT      NULL,
      lowest_spo2_pct         TINYINT      NULL,
      avg_respiration_brpm    TINYINT      NULL,
      lowest_respiration_brpm TINYINT      NULL,
      notes                   TEXT         NULL,
      created_by              VARCHAR(128) NOT NULL,
      created_dt              BIGINT       NOT NULL,
      record_status           VARCHAR(1)   NOT NULL DEFAULT 'A',
      UNIQUE KEY uq_sleep_date_user (date, created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
