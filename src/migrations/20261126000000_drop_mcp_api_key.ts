import type { Knex } from "knex";

// The MCP feature (/mcp server + /mcp-key key management) was removed, so its key table goes too.
// down() recreates the table exactly as 20261107000000_create_mcp_api_key made it (data is not restored).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_mcp_api_key");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_mcp_api_key (
      id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      user_id       BIGINT        NOT NULL,
      api_key_hash  VARCHAR(64)   NOT NULL,
      key_hint      VARCHAR(10)   DEFAULT NULL,
      name          VARCHAR(100)  DEFAULT NULL,
      record_status CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt    BIGINT        NOT NULL,
      created_by_id BIGINT        NOT NULL,
      updated_dt    BIGINT        DEFAULT NULL,
      updated_by_id BIGINT        DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_mcp_api_key_hash (api_key_hash, record_status),
      KEY idx_mcp_api_key_user (user_id, record_status),
      CONSTRAINT FK_tb_mcp_api_key_user FOREIGN KEY (user_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
