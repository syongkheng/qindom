import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_llm_model (
      id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
      model_name    VARCHAR(256)  NOT NULL,
      model_key     VARCHAR(256)  NOT NULL,
      record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
      created_dt    BIGINT        NOT NULL,
      created_by    VARCHAR(128)  NOT NULL,
      updated_dt    BIGINT        NULL,
      updated_by    VARCHAR(128)  NULL,
      UNIQUE KEY uq_model_key (model_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_llm_model`);
}
