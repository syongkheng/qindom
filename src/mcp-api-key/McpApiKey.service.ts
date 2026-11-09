import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITbMcpApiKey } from "../models/databases/tb_mcp_api_key.js";

export interface McpApiKeyStatusDto {
  hasKey: boolean;
  createdDt: number | null;
  keyHint: string | null;
}

// "mcp_" key for MCP clients (Claude Desktop / Claude Code) — one active key per user.
export class McpApiKeyService {
  constructor(private readonly db: KnexSqlUtilities) {}

  async getKeyStatus(userId: number): Promise<McpApiKeyStatusDto> {
    const existing = await this.db.findOne<ITbMcpApiKey>("tb_mcp_api_key", { user_id: userId, record_status: "A" }, [
      "id",
      "key_hint",
      "created_dt",
    ]);
    if (!existing) return { hasKey: false, createdDt: null, keyHint: null };
    return { hasKey: true, createdDt: existing.created_dt, keyHint: existing.key_hint ?? null };
  }

  // Revokes any active key first, so regenerating invalidates the previous one.
  async generateKey(userId: number): Promise<{ key: string }> {
    const now = Date.now();
    await this.db.update<ITbMcpApiKey>(
      "tb_mcp_api_key",
      { user_id: userId, record_status: "A" },
      { record_status: "D", updated_dt: now, updated_by_id: userId },
    );

    const rawValue = crypto.randomBytes(32).toString("hex");
    await this.db.insert<ITbMcpApiKey>("tb_mcp_api_key", {
      user_id: userId,
      api_key_hash: crypto.createHash("sha256").update(rawValue).digest("hex"),
      key_hint: rawValue.slice(0, 5),
      name: "MCP",
      created_dt: now,
      created_by_id: userId,
      record_status: "A",
    });
    return { key: `mcp_${rawValue}` };
  }

  async revokeKey(userId: number): Promise<{ revoked: boolean }> {
    await this.db.update<ITbMcpApiKey>(
      "tb_mcp_api_key",
      { user_id: userId, record_status: "A" },
      { record_status: "D", updated_dt: Date.now(), updated_by_id: userId },
    );
    return { revoked: true };
  }
}
