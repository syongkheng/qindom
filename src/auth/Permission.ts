import type { Request } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IDecodedTokenUser } from "../token/Token.types.js";
import { ITB_AA_RESOURCE_ACCESS } from "../models/databases/tb_aa_resource_access.js";
import { hasRole } from "../utils/RequestUtilities.js";
import { RecordStatus } from "../constants/RecordStatus.js";

const RESOURCE_ACCESS_TABLE = "tb_aa_resource_access";

/**
 * Permission model — two layers:
 *
 *  1. Global roles (tb_aa_user.roles, JSON string[]). Unchanged. SYSTEM_R5 is the OWNER:
 *     logs, admin pages, user management, and implicit access to every resource.
 *  2. Resource grants (tb_aa_resource_access). Per-user access to ONE resource, e.g.
 *     one analytics system's dashboard. Grants never confer any global role, so a
 *     grant can never open /auth/admin/* (logs, users).
 */

export const Roles = {
  OWNER: "SYSTEM_R5",
  /** Legacy literal still used by the suggestion routes. */
  LEGACY_ADMIN: "admin",
} as const;

/**
 * Accepted role format: MODULE_R<1-5> (e.g. SYSTEM_R5, TRAVEL_R4) or the legacy 'admin'.
 * Guards role writes so a typo such as 'SYSTEM_r5' can't be saved silently.
 */
const ROLE_PATTERN = /^(?:[A-Z][A-Z0-9]*_R[1-5]|admin)$/;

/**
 * Parses `tb_aa_user.roles` (a JSON array string). Bad or missing JSON → no roles.
 * Always read roles from the DB row, not the JWT: the token's roles are a login-time
 * snapshot, so a demoted admin would otherwise keep access until it expires.
 */
export function parseRoles(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isValidRole(role: unknown): role is string {
  return typeof role === "string" && ROLE_PATTERN.test(role);
}

export function isOwner(req: Request): boolean {
  return hasRole(req, Roles.OWNER);
}

export function userIsOwner(user: Pick<IDecodedTokenUser, "roles"> | undefined): boolean {
  return user?.roles?.includes(Roles.OWNER) ?? false;
}

export const ResourceType = {
  ANALYTICS_SYSTEM: "analytics_system",
} as const;
export type ResourceTypeValue = (typeof ResourceType)[keyof typeof ResourceType];

/** `tb_aa_resource_access.access_level` values. Only viewer grants exist today. */
export const AccessLevel = {
  VIEWER: "viewer",
} as const;

export interface ResourceGrant {
  userId: number;
  username: string;
  email: string | null;
  system: string;
  accessLevel: string;
  grantedDt: number;
}

export class PermissionService {
  constructor(private db: KnexSqlUtilities) {}

  /** OWNER → always; otherwise needs an active grant. */
  async canAccessResource(user: IDecodedTokenUser | undefined, type: ResourceTypeValue, key: string): Promise<boolean> {
    if (!user) return false;
    if (userIsOwner(user)) return true;
    const row = await this.db.findOne<ITB_AA_RESOURCE_ACCESS>(
      RESOURCE_ACCESS_TABLE,
      { user_id: user.id, resource_type: type, resource_key: key, record_status: RecordStatus.ACTIVE },
      ["id"],
    );
    return !!row;
  }

  /** Keys the user holds active grants for. Callers decide what OWNER sees (usually "everything"). */
  async grantedKeys(userId: number, type: ResourceTypeValue): Promise<string[]> {
    const rows = await this.db.find<ITB_AA_RESOURCE_ACCESS>(
      RESOURCE_ACCESS_TABLE,
      { user_id: userId, resource_type: type, record_status: RecordStatus.ACTIVE },
      { columns: ["resource_key"] },
    );
    return rows.map((r) => r.resource_key);
  }

  /** Active grants of active users (a soft-deleted user's grant is gone). */
  async listGrants(type: ResourceTypeValue, key: string): Promise<ResourceGrant[]> {
    const rows = await this.db.raw<
      {
        user_id: number;
        username: string;
        email: string | null;
        system: string;
        access_level: string;
        updated_dt: number;
      }[]
    >(
      `SELECT ra.user_id, u.username, u.email, u.\`system\`, ra.access_level, ra.updated_dt
         FROM tb_aa_resource_access ra
         JOIN tb_aa_user u ON u.id = ra.user_id AND u.record_status = ?
        WHERE ra.resource_type = ? AND ra.resource_key = ? AND ra.record_status = ?
        ORDER BY ra.updated_dt DESC`,
      [RecordStatus.ACTIVE, type, key, RecordStatus.ACTIVE],
    );
    return rows.map((r) => ({
      userId: Number(r.user_id),
      username: r.username,
      email: r.email ?? null,
      system: r.system,
      accessLevel: r.access_level,
      grantedDt: Number(r.updated_dt),
    }));
  }

  /** Idempotent: re-activates a previously revoked grant instead of inserting a duplicate. */
  async grant(type: ResourceTypeValue, key: string, userId: number, grantedById: number): Promise<void> {
    const now = Date.now();
    const existing = await this.db.findOne<ITB_AA_RESOURCE_ACCESS>(
      RESOURCE_ACCESS_TABLE,
      { user_id: userId, resource_type: type, resource_key: key },
      ["id"],
    );
    if (existing) {
      await this.db.update<ITB_AA_RESOURCE_ACCESS>(
        RESOURCE_ACCESS_TABLE,
        { id: existing.id },
        {
          record_status: RecordStatus.ACTIVE,
          access_level: AccessLevel.VIEWER,
          granted_by_id: grantedById,
          updated_dt: now,
        },
      );
      return;
    }
    await this.db.insert<ITB_AA_RESOURCE_ACCESS>(RESOURCE_ACCESS_TABLE, {
      user_id: userId,
      resource_type: type,
      resource_key: key,
      access_level: AccessLevel.VIEWER,
      granted_by_id: grantedById,
      record_status: RecordStatus.ACTIVE,
      created_dt: now,
      updated_dt: now,
    });
  }

  /** Soft revoke (record_status = 'D'). */
  async revoke(type: ResourceTypeValue, key: string, userId: number): Promise<void> {
    await this.db.update<ITB_AA_RESOURCE_ACCESS>(
      RESOURCE_ACCESS_TABLE,
      { user_id: userId, resource_type: type, resource_key: key },
      { record_status: RecordStatus.DELETED, updated_dt: Date.now() },
    );
  }
}
