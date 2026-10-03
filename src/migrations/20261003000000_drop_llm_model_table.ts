import type { Knex } from "knex";

// The LLM / AI-marketplace feature was fully removed (backend src/llm/* route +
// model, and the fndom marketplace UI). tb_llm_model was the last table left
// from it — the pricing/wallet tables were already dropped in
// 20260922000200_drop_llm_marketplace_pricing_tables. Nothing live reads it, so
// drop it here. down() recreates the original schema from the initial migration.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_llm_model`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_llm_model (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      model_name    VARCHAR(256) NOT NULL,
      model_key     VARCHAR(256) NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      created_dt    BIGINT       NOT NULL,
      created_by_id BIGINT       NOT NULL,
      updated_dt    BIGINT       DEFAULT NULL,
      updated_by_id BIGINT       DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_model_key (model_key),
      KEY FK_tb_llm_model_created_by (created_by_id),
      KEY FK_tb_llm_model_updated_by (updated_by_id),
      CONSTRAINT FK_tb_llm_model_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_llm_model_updated_by FOREIGN KEY (updated_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
