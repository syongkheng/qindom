import type { Knex } from "knex";

// Phones running the camera recorder app. A row is created when a phone first registers (user_id NULL)
// and bound to a user when they claim its pairing code from the fndom /camera dashboard. Only the
// SHA-256 of the device token is stored. Live connections and pairing codes are in memory only.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_camera_device (
      id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      uuid          CHAR(36)      NOT NULL,
      token_hash    CHAR(64)      NOT NULL,
      user_id       BIGINT        DEFAULT NULL,
      name          VARCHAR(60)   NOT NULL,
      paired_dt     BIGINT        DEFAULT NULL,
      last_seen_dt  BIGINT        DEFAULT NULL,
      record_status CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt    BIGINT        NOT NULL,
      updated_dt    BIGINT        DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_camera_device_uuid (uuid),
      UNIQUE KEY uk_camera_device_token (token_hash),
      KEY idx_camera_device_user (user_id, record_status),
      CONSTRAINT FK_tb_camera_device_user FOREIGN KEY (user_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_camera_device");
}
