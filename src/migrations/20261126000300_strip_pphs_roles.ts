import type { Knex } from "knex";

// The HDB PPHS module is gone (20261126000100), so its roles mean nothing and the admin UI can't remove
// them. Strip "PPHS_R4" / "PPHS_R5" from every tb_aa_user.roles JSON array (active and soft-deleted rows).
// Read-modify-write in JS, so it doesn't depend on the server's JSON functions; rows whose roles aren't
// a JSON array are left untouched.

const USER_TABLE = "tb_aa_user";
export const PPHS_ROLES = ["PPHS_R4", "PPHS_R5"];

/** The new `roles` value without `removed`, or null when the row needs no update (no match or not a JSON array). */
export function stripRoles(raw: string | null, removed: readonly string[]): string | null {
  let roles: unknown;
  try {
    roles = JSON.parse(raw ?? "");
  } catch {
    return null;
  }
  if (!Array.isArray(roles)) return null;
  const kept = roles.filter((role) => !removed.includes(role));
  return kept.length === roles.length ? null : JSON.stringify(kept);
}

export async function up(knex: Knex): Promise<void> {
  const rows: { id: number; roles: string | null }[] = await knex(USER_TABLE)
    .select("id", "roles")
    .where("roles", "like", "%PPHS_R%");
  for (const row of rows) {
    const roles = stripRoles(row.roles, PPHS_ROLES);
    if (roles !== null) await knex(USER_TABLE).where({ id: row.id }).update({ roles });
  }
}

// No-op: the stripped roles were meaningless (nothing checks them any more), so there is nothing to restore.
export async function down(): Promise<void> {}
