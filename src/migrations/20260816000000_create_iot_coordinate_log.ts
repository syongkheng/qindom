import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
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
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_iot_coordinate_log`);
}
