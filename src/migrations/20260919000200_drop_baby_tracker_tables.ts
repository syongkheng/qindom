import type { Knex } from "knex";

// Baby Tracker feature removed — drops its two tables. The shared
// tb_ss_api_key table (used by Apple Pay and any future Siri Shortcut
// integration) is untouched.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_baby_diaper_record`);
  await knex.raw(`DROP TABLE IF EXISTS tb_baby_feeding_record`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_baby_feeding_record (
      id             BIGINT        NOT NULL AUTO_INCREMENT,
      user_id        BIGINT        NOT NULL,
      amount_ml      DECIMAL(6,2)  NULL,
      duration_min   INT           NULL,
      fed_dt         BIGINT        NOT NULL,
      notes          VARCHAR(512)  NULL,
      created_dt     BIGINT        NOT NULL,
      record_status  CHAR(1)       NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      INDEX idx_baby_feeding_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_baby_diaper_record (
      id             BIGINT        NOT NULL AUTO_INCREMENT,
      user_id        BIGINT        NOT NULL,
      load_level     VARCHAR(16)   NULL,
      changed_dt     BIGINT        NOT NULL,
      notes          VARCHAR(512)  NULL,
      created_dt     BIGINT        NOT NULL,
      record_status  CHAR(1)       NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      INDEX idx_baby_diaper_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
