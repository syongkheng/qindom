import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_suggestion_note (
      id                       BIGINT        NOT NULL AUTO_INCREMENT,
      country                  VARCHAR(128)  NOT NULL,
      title                    VARCHAR(255)  NOT NULL,
      url                      VARCHAR(512)  NOT NULL,
      category                 VARCHAR(64)   NULL,
      mandatory                TINYINT(1)    NOT NULL DEFAULT 0,
      min_days_before_arrival  INT           NULL,
      max_advance_hours        INT           NULL,
      notes                    TEXT          NULL,
      record_status            CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt               BIGINT        NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_suggestion_note_country (country)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Pre-trip arrival-card style reminders — link + deadline only, never an
  // integration that submits on the user's behalf. ────────────────────────────
  const now = Date.now();
  await knex("tb_suggestion_note").insert([
    {
      country: "Singapore",
      title: "SG Arrival Card",
      url: "https://www.ica.gov.sg/enter-transit-depart/entering-singapore/sg-arrival-card",
      category: "arrival_card",
      mandatory: 1,
      min_days_before_arrival: 3,
      max_advance_hours: null,
      notes: "Mandatory for all visitors. Submit within 3 days before arrival (including day of arrival).",
      record_status: "A",
      created_dt: now,
    },
    {
      country: "Thailand",
      title: "Thailand Digital Arrival Card (TDAC)",
      url: "https://tdac.immigration.go.th",
      category: "arrival_card",
      mandatory: 1,
      min_days_before_arrival: 3,
      max_advance_hours: null,
      notes: "Mandatory, free. Submit within 3 days before arrival.",
      record_status: "A",
      created_dt: now,
    },
    {
      country: "Japan",
      title: "Visit Japan Web",
      url: "https://services.digital.go.jp/en/visit-japan-web/",
      category: "arrival_card",
      mandatory: 0,
      min_days_before_arrival: null,
      max_advance_hours: 6,
      notes: "Optional convenience tool for immigration/customs/tax-free QR codes. Can be completed any time up to 6 hours before landing.",
      record_status: "A",
      created_dt: now,
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_suggestion_note`);
}
