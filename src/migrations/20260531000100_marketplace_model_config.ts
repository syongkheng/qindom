import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_marketplace_model_config (
      model_id              VARCHAR(64)   PRIMARY KEY,
      display_name          VARCHAR(128)  NOT NULL,
      provider              VARCHAR(32)   NOT NULL,
      provider_color        VARCHAR(16)   NOT NULL,
      input_price_display   VARCHAR(16)   NOT NULL,
      output_price_display  VARCHAR(16)   NOT NULL,
      input_cents_per_k     INT           NOT NULL DEFAULT 0,
      output_cents_per_k    INT           NOT NULL DEFAULT 0,
      context_window        VARCHAR(16)   NOT NULL,
      max_output_tokens     VARCHAR(16)   NOT NULL,
      badge                 VARCHAR(32)   NULL,
      tags                  TEXT          NOT NULL,
      is_active             TINYINT(1)    NOT NULL DEFAULT 1,
      sort_order            INT           NOT NULL DEFAULT 0,
      created_dt            BIGINT        NOT NULL,
      updated_dt            BIGINT        NULL,
      created_by            VARCHAR(128)  NOT NULL,
      record_status         VARCHAR(1)    NOT NULL DEFAULT 'A'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const now = Date.now();

  // Seed all 8 models. Billing rates in SGD cents per 1000 tokens
  // (provider USD price × ~1.35 USD/SGD × 1.2 platform markup, rounded up).
  const models = [
    {
      model_id:             "claude-sonnet-4-6",
      display_name:         "Claude Sonnet 4",
      provider:             "Anthropic",
      provider_color:       "#C84B31",
      input_price_display:  "$3.00",
      output_price_display: "$15.00",
      input_cents_per_k:    5,
      output_cents_per_k:   25,
      context_window:       "200K",
      max_output_tokens:    "64K",
      badge:                "Popular",
      tags:                 JSON.stringify(["Coding", "Analysis", "Reasoning"]),
      is_active:            1,
      sort_order:           1,
    },
    {
      model_id:             "claude-opus-4-8",
      display_name:         "Claude Opus 4",
      provider:             "Anthropic",
      provider_color:       "#C84B31",
      input_price_display:  "$15.00",
      output_price_display: "$75.00",
      input_cents_per_k:    25,
      output_cents_per_k:   125,
      context_window:       "200K",
      max_output_tokens:    "32K",
      badge:                null,
      tags:                 JSON.stringify(["Complex Tasks", "Reasoning", "Research"]),
      is_active:            1,
      sort_order:           2,
    },
    {
      model_id:             "claude-haiku-4-5-20251001",
      display_name:         "Claude Haiku 4",
      provider:             "Anthropic",
      provider_color:       "#C84B31",
      input_price_display:  "$0.80",
      output_price_display: "$4.00",
      input_cents_per_k:    2,
      output_cents_per_k:   7,
      context_window:       "200K",
      max_output_tokens:    "16K",
      badge:                "Fastest",
      tags:                 JSON.stringify(["Fast", "Lightweight", "High Volume"]),
      is_active:            1,
      sort_order:           3,
    },
    {
      model_id:             "gpt-4o",
      display_name:         "GPT-4o",
      provider:             "OpenAI",
      provider_color:       "#10a37f",
      input_price_display:  "$2.50",
      output_price_display: "$10.00",
      input_cents_per_k:    5,
      output_cents_per_k:   18,
      context_window:       "128K",
      max_output_tokens:    "16K",
      badge:                null,
      tags:                 JSON.stringify(["Multimodal", "Vision", "General"]),
      is_active:            1,
      sort_order:           4,
    },
    {
      model_id:             "gpt-4o-mini",
      display_name:         "GPT-4o mini",
      provider:             "OpenAI",
      provider_color:       "#10a37f",
      input_price_display:  "$0.15",
      output_price_display: "$0.60",
      input_cents_per_k:    1,
      output_cents_per_k:   1,
      context_window:       "128K",
      max_output_tokens:    "16K",
      badge:                "Best Value",
      tags:                 JSON.stringify(["Affordable", "Summarisation", "Structured"]),
      is_active:            1,
      sort_order:           5,
    },
    {
      model_id:             "gemini-2.0-flash",
      display_name:         "Gemini 2.0 Flash",
      provider:             "Google",
      provider_color:       "#4285F4",
      input_price_display:  "$0.10",
      output_price_display: "$0.40",
      input_cents_per_k:    1,
      output_cents_per_k:   1,
      context_window:       "1M",
      max_output_tokens:    "8K",
      badge:                "New",
      tags:                 JSON.stringify(["Multimodal", "Long Context", "Fast"]),
      is_active:            1,
      sort_order:           6,
    },
    {
      model_id:             "gemini-1.5-pro",
      display_name:         "Gemini 1.5 Pro",
      provider:             "Google",
      provider_color:       "#4285F4",
      input_price_display:  "$1.25",
      output_price_display: "$5.00",
      input_cents_per_k:    3,
      output_cents_per_k:   9,
      context_window:       "2M",
      max_output_tokens:    "8K",
      badge:                null,
      tags:                 JSON.stringify(["Long Context", "Documents", "Analysis"]),
      is_active:            1,
      sort_order:           7,
    },
    {
      model_id:             "llama-3.3-70b-instruct",
      display_name:         "Llama 3.3 70B",
      provider:             "Meta",
      provider_color:       "#0082FB",
      input_price_display:  "$0.59",
      output_price_display: "$0.79",
      input_cents_per_k:    1,
      output_cents_per_k:   2,
      context_window:       "128K",
      max_output_tokens:    "8K",
      badge:                null,
      tags:                 JSON.stringify(["Open Source", "Self-hostable", "Flexible"]),
      is_active:            1,
      sort_order:           8,
    },
  ];

  for (const m of models) {
    await knex.raw(
      `INSERT IGNORE INTO tb_marketplace_model_config
        (model_id, display_name, provider, provider_color, input_price_display,
         output_price_display, input_cents_per_k, output_cents_per_k, context_window,
         max_output_tokens, badge, tags, is_active, sort_order, created_dt, created_by, record_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYSTEM', 'A')`,
      [
        m.model_id, m.display_name, m.provider, m.provider_color,
        m.input_price_display, m.output_price_display,
        m.input_cents_per_k, m.output_cents_per_k,
        m.context_window, m.max_output_tokens,
        m.badge, m.tags, m.is_active, m.sort_order, now,
      ],
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_marketplace_model_config");
}
