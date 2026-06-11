import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_marketplace_wallet (
      id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
      username      VARCHAR(128)  NOT NULL,
      balance_cents INT           NOT NULL DEFAULT 0,
      currency      VARCHAR(8)    NOT NULL DEFAULT 'SGD',
      created_dt    BIGINT        NOT NULL,
      updated_dt    BIGINT        NULL,
      record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
      UNIQUE KEY uq_wallet_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_marketplace_topup (
      id             BIGINT        PRIMARY KEY AUTO_INCREMENT,
      username       VARCHAR(128)  NOT NULL,
      amount_cents   INT           NOT NULL,
      payment_method VARCHAR(32)   NOT NULL,
      ref_id         VARCHAR(64)   NOT NULL,
      created_dt     BIGINT        NOT NULL,
      record_status  VARCHAR(1)    NOT NULL DEFAULT 'A',
      INDEX idx_topup_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_marketplace_api_key (
      id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
      username      VARCHAR(128)  NOT NULL,
      api_key       VARCHAR(64)   NOT NULL,
      label         VARCHAR(128)  NOT NULL DEFAULT 'default',
      created_dt    BIGINT        NOT NULL,
      updated_dt    BIGINT        NULL,
      record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
      UNIQUE KEY uq_api_key (api_key),
      INDEX idx_apikey_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_marketplace_session (
      id            VARCHAR(36)   PRIMARY KEY,
      username      VARCHAR(128)  NOT NULL,
      model_id      VARCHAR(64)   NOT NULL,
      title         VARCHAR(255)  NOT NULL,
      created_dt    BIGINT        NOT NULL,
      updated_dt    BIGINT        NULL,
      record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
      INDEX idx_session_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_marketplace_message (
      id            VARCHAR(36)   PRIMARY KEY,
      session_id    VARCHAR(36)   NOT NULL,
      role          VARCHAR(16)   NOT NULL,
      content       LONGTEXT      NOT NULL,
      tokens_in     INT           NOT NULL DEFAULT 0,
      tokens_out    INT           NOT NULL DEFAULT 0,
      created_dt    BIGINT        NOT NULL,
      record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
      INDEX idx_message_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_marketplace_provider_key (
      id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
      provider      VARCHAR(32)   NOT NULL,
      api_key       VARCHAR(255)  NOT NULL,
      label         VARCHAR(128)  NOT NULL DEFAULT '',
      is_active     TINYINT(1)    NOT NULL DEFAULT 1,
      usage_count   INT           NOT NULL DEFAULT 0,
      last_used_dt  BIGINT        NULL,
      created_dt    BIGINT        NOT NULL,
      record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
      INDEX idx_provkey_provider (provider)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_marketplace_provider_key");
  await knex.schema.dropTableIfExists("tb_marketplace_message");
  await knex.schema.dropTableIfExists("tb_marketplace_session");
  await knex.schema.dropTableIfExists("tb_marketplace_api_key");
  await knex.schema.dropTableIfExists("tb_marketplace_topup");
  await knex.schema.dropTableIfExists("tb_marketplace_wallet");
}
