import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_meal_log");
  await knex.schema.dropTableIfExists("tb_meal_photo");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_meal_log (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      log_date      VARCHAR(10)  NOT NULL,
      meal_type     VARCHAR(16)  NOT NULL,
      planned_name  VARCHAR(256) NOT NULL,
      notes         TEXT,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_meal_log_created_by (created_by),
      KEY idx_meal_log_date (log_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_meal_photo (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      uuid          VARCHAR(64)  NOT NULL,
      meal_log_id   BIGINT       NOT NULL,
      name          VARCHAR(256),
      mime_type     VARCHAR(128),
      size_in_bytes BIGINT,
      \`blob\`        LONGBLOB,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_meal_photo_uuid (uuid),
      KEY idx_meal_photo_log_id (meal_log_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
