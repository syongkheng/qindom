import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
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
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_iot_device_heartbeat`);
  await knex.raw(`DROP TABLE IF EXISTS tb_iot_api_key`);
}
