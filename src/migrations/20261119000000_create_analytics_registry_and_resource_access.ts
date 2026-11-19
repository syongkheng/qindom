import type { Knex } from "knex";

// Analytics v1:
//  - tb_analytic_system: the whitelist of systems allowed to send analytics, with each
//    system's own breakpoints (and the normalised small/medium/large size each maps to).
//  - tb_aa_resource_access: per-user grants to a single resource (e.g. one analytics
//    system's dashboard). SYSTEM_R5 bypasses this table entirely.
//  - tb_analytic_event: screen columns + a composite index for the dashboard queries.
// Note: `system` is a MySQL reserved word and must be backtick-quoted.

const SEED_SYSTEMS = [
  {
    system_key: "fndom",
    display_name: "Awense",
    breakpoints: [
      { key: "S", label: "S (≤425px)", maxWidth: 425, size: "small" },
      { key: "M", label: "M (≤800px)", maxWidth: 800, size: "medium" },
      { key: "CALENDAR", label: "Calendar (≤1200px)", maxWidth: 1200, size: "large" },
      { key: "L", label: "L (>1200px)", maxWidth: null, size: "large" },
    ],
  },
  {
    system_key: "jessikheng",
    display_name: "Jessikheng Wedding",
    breakpoints: [
      { key: "phone", label: "Phone (≤800px)", maxWidth: 800, size: "small" },
      { key: "desktop", label: "Desktop (>800px)", maxWidth: null, size: "large" },
    ],
  },
  {
    system_key: "dental-directory",
    display_name: "PDCA Dental",
    breakpoints: [
      { key: "sm", label: "Small (≤560px)", maxWidth: 560, size: "small" },
      { key: "md", label: "Medium (≤860px)", maxWidth: 860, size: "medium" },
      { key: "lg", label: "Large (≤1024px)", maxWidth: 1024, size: "large" },
      { key: "xl", label: "X-Large (>1024px)", maxWidth: null, size: "large" },
    ],
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_analytic_system (
      id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      system_key      VARCHAR(64)   NOT NULL,
      display_name    VARCHAR(128)  NOT NULL,
      breakpoints     TEXT          NOT NULL,
      allowed_origins TEXT          NOT NULL,
      record_status   CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt      BIGINT        NOT NULL,
      updated_dt      BIGINT        NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_analytic_system_key (system_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_aa_resource_access (
      id             BIGINT        NOT NULL AUTO_INCREMENT,
      user_id        BIGINT        NOT NULL,
      resource_type  VARCHAR(32)   NOT NULL,
      resource_key   VARCHAR(128)  NOT NULL,
      access_level   VARCHAR(16)   NOT NULL DEFAULT 'viewer',
      granted_by_id  BIGINT        NULL,
      record_status  CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt     BIGINT        NOT NULL,
      updated_dt     BIGINT        NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_resource_access (user_id, resource_type, resource_key),
      KEY idx_resource_access_resource (resource_type, resource_key, record_status),
      CONSTRAINT FK_tb_aa_resource_access_user FOREIGN KEY (user_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    ALTER TABLE tb_analytic_event
      ADD COLUMN screen_width      INT          NULL AFTER user_agent,
      ADD COLUMN screen_height     INT          NULL AFTER screen_width,
      ADD COLUMN screen_breakpoint VARCHAR(32)  NULL AFTER screen_height,
      ADD COLUMN screen_size       VARCHAR(16)  NULL AFTER screen_breakpoint,
      ADD INDEX idx_analytic_event_system_event_created (\`system\`, event, created_at)
  `);

  const now = Date.now();
  for (const s of SEED_SYSTEMS) {
    await knex.raw(
      `INSERT IGNORE INTO tb_analytic_system
         (system_key, display_name, breakpoints, allowed_origins, record_status, created_dt, updated_dt)
       VALUES (?, ?, ?, '[]', 'A', ?, ?)`,
      [s.system_key, s.display_name, JSON.stringify(s.breakpoints), now, now],
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_analytic_event
      DROP INDEX idx_analytic_event_system_event_created,
      DROP COLUMN screen_size,
      DROP COLUMN screen_breakpoint,
      DROP COLUMN screen_height,
      DROP COLUMN screen_width
  `);
  await knex.schema.dropTableIfExists("tb_aa_resource_access");
  await knex.schema.dropTableIfExists("tb_analytic_system");
}
