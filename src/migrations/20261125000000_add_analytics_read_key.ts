import type { Knex } from "knex";

// POST /analytics/report (pdca.analytics.report/v1) is read with a per-system viewer key instead of a
// user login. Only the sha256 hex of the key is stored; rotate with POST /analytics/admin/systems/:key/read-key.
// Also aligns the dental-directory breakpoints with the rebuilt PDCA site (460 / 820 / 1024 px).

const DENTAL_BREAKPOINTS = [
  { key: "sm", label: "Small (≤460px)", maxWidth: 460, size: "small" },
  { key: "md", label: "Medium (≤820px)", maxWidth: 820, size: "medium" },
  { key: "lg", label: "Large (≤1024px)", maxWidth: 1024, size: "large" },
  { key: "xl", label: "X-Large (>1024px)", maxWidth: null, size: "large" },
];

const OLD_DENTAL_BREAKPOINTS = [
  { key: "sm", label: "Small (≤560px)", maxWidth: 560, size: "small" },
  { key: "md", label: "Medium (≤860px)", maxWidth: 860, size: "medium" },
  { key: "lg", label: "Large (≤1024px)", maxWidth: 1024, size: "large" },
  { key: "xl", label: "X-Large (>1024px)", maxWidth: null, size: "large" },
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tb_analytic_system ADD COLUMN read_key_hash CHAR(64) NULL AFTER allowed_origins`);
  await knex.raw(
    `UPDATE tb_analytic_system SET breakpoints = ?, updated_dt = ? WHERE system_key = 'dental-directory'`,
    [JSON.stringify(DENTAL_BREAKPOINTS), Date.now()],
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `UPDATE tb_analytic_system SET breakpoints = ?, updated_dt = ? WHERE system_key = 'dental-directory'`,
    [JSON.stringify(OLD_DENTAL_BREAKPOINTS), Date.now()],
  );
  await knex.raw(`ALTER TABLE tb_analytic_system DROP COLUMN read_key_hash`);
}
