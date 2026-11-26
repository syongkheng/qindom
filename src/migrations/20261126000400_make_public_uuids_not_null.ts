import type { Knex } from "knex";

// `uuid` is the public id of budget items and Apple Pay transactions, but both columns were added as NULL
// (20260919000000, 20260919000100). Every insert sets it, yet prod can't be checked from here, so this is
// safe on any data: first give every NULL row a fresh UUID() (evaluated per row), then make the column
// NOT NULL. MODIFY keeps the column position and the existing unique keys
// (uq_budget_item_uuid, uq_applepay_transaction_uuid). `down()` relaxes both back to NULL; the
// backfilled values stay (they're valid ids).

export const PUBLIC_UUID_TABLES = ["tb_budget_item", "tb_applepay_transaction"] as const;
const UUID_COLUMN_TYPE = "VARCHAR(36)";

/** Fills every NULL uuid of `table` with a new MySQL UUID(). */
export function backfillUuidSql(table: string): string {
  return `UPDATE ${table} SET uuid = UUID() WHERE uuid IS NULL`;
}

/** Changes only the nullability of `table.uuid`; type, length and the unique key stay as they are. */
export function setUuidNullabilitySql(table: string, nullable: boolean): string {
  return `ALTER TABLE ${table} MODIFY COLUMN uuid ${UUID_COLUMN_TYPE} ${nullable ? "NULL" : "NOT NULL"}`;
}

export async function up(knex: Knex): Promise<void> {
  for (const table of PUBLIC_UUID_TABLES) {
    await knex.raw(backfillUuidSql(table));
    await knex.raw(setUuidNullabilitySql(table, false));
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of PUBLIC_UUID_TABLES) {
    await knex.raw(setUuidNullabilitySql(table, true));
  }
}
