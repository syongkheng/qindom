import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add numeric USD price columns to model config
  await knex.raw(`
    ALTER TABLE tb_marketplace_model_config
      ADD COLUMN input_price_usd_mtok  DECIMAL(10,4) NOT NULL DEFAULT 0 AFTER output_price_display,
      ADD COLUMN output_price_usd_mtok DECIMAL(10,4) NOT NULL DEFAULT 0 AFTER input_price_usd_mtok
  `);

  // Seed USD prices for all 8 models (matching provider published rates)
  const updates: Array<[string, number, number]> = [
    ["claude-sonnet-4-6",        3.00,  15.00],
    ["claude-opus-4-8",         15.00,  75.00],
    ["claude-haiku-4-5-20251001", 0.80,   4.00],
    ["gpt-4o",                   2.50,  10.00],
    ["gpt-4o-mini",              0.15,   0.60],
    ["gemini-2.0-flash",         0.10,   0.40],
    ["gemini-1.5-pro",           1.25,   5.00],
    ["llama-3.3-70b-instruct",   0.59,   0.79],
  ];
  for (const [modelId, inputUsd, outputUsd] of updates) {
    await knex.raw(
      `UPDATE tb_marketplace_model_config SET input_price_usd_mtok = ?, output_price_usd_mtok = ? WHERE model_id = ?`,
      [inputUsd, outputUsd, modelId],
    );
  }

  // Global settings table (key-value, single row per setting)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_marketplace_settings (
      \`key\`       VARCHAR(64)  PRIMARY KEY,
      value        VARCHAR(255) NOT NULL,
      updated_dt   BIGINT       NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const now = Date.now();
  await knex.raw(
    `INSERT IGNORE INTO tb_marketplace_settings (\`key\`, value, updated_dt) VALUES
      ('exchange_rate_usd_sgd', '1.35', ?),
      ('platform_markup_pct',   '20',   ?)`,
    [now, now],
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_marketplace_settings");
  await knex.raw(`
    ALTER TABLE tb_marketplace_model_config
      DROP COLUMN IF EXISTS input_price_usd_mtok,
      DROP COLUMN IF EXISTS output_price_usd_mtok
  `);
}
