import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_marketplace_api_key
      ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER label
  `);

  const now = Date.now();
  await knex.raw(
    `INSERT INTO tb_marketplace_api_key (username, api_key, label, is_public, created_dt, record_status)
     VALUES ('__public__', ?, 'Public Trial Key', 1, ?, 'A')`,
    ["pub" + "0".repeat(29), now],
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DELETE FROM tb_marketplace_api_key WHERE username = '__public__'`);
  await knex.raw(`ALTER TABLE tb_marketplace_api_key DROP COLUMN IF EXISTS is_public`);
}
