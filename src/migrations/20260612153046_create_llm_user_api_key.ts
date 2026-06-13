import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE tb_llm_api_token (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,

    token_prefix VARCHAR(20) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,

    name NVARCHAR(100) NULL,

    rate_limit_per_min INT NOT NULL DEFAULT 60,

    revoked_at BIGINT NULL,

    created_dt            BIGINT            NOT NULL,
    created_by            VARCHAR(128)        NOT NULL,
    updated_dt            BIGINT              NULL,
    updated_by            VARCHAR(128)        NULL,
    record_status         VARCHAR(1)    NOT NULL DEFAULT 'A',

    CONSTRAINT FK_tb_llm_api_token_user
        FOREIGN KEY (user_id)
        REFERENCES tb_aa_user(id)
);`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_llm_api_token;`);
}
