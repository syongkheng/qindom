import crypto from "crypto";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ITbSsApiKey } from "../models/databases/tb_ss_api_key.js";

export interface BabyApiKeyStatusDto {
  hasKey: boolean;
  name: string | null;
  createdDt: number | null;
  keyHint: string | null;
}

export class BabyApiKeyService {
  constructor(private readonly db: KnexSqlUtilities) {}

  async getKeyStatus(userId: number, logEvent?: IRequestLogEvent): Promise<BabyApiKeyStatusDto> {
    const existing = await this.db.findOne<ITbSsApiKey>(
      "tb_ss_api_key",
      { user_id: userId, record_status: "A" },
      ["id", "name", "key_hint", "created_dt"],
      logEvent,
    );
    if (!existing) return { hasKey: false, name: null, createdDt: null, keyHint: null };
    return { hasKey: true, name: existing.name ?? null, createdDt: existing.created_dt, keyHint: existing.key_hint ?? null };
  }

  async generateKey(userId: number, logContext?: IRequestLogContext): Promise<{ key: string }> {
    const serviceEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "SERVICE", "Generating API key")
      : undefined;

    const now = Date.now();

    await this.db.update<ITbSsApiKey>(
      "tb_ss_api_key",
      { user_id: userId, record_status: "A" },
      { record_status: "D", updated_dt: now, updated_by_id: userId },
      serviceEvent,
    );

    const rawValue = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawValue).digest("hex");
    const keyHint = rawValue.slice(0, 5);

    await this.db.insert<ITbSsApiKey>(
      "tb_ss_api_key",
      {
        user_id: userId,
        api_key_prefix: "ss",
        api_key_hash: keyHash,
        key_hint: keyHint,
        name: "Baby Tracker",
        created_dt: now,
        created_by_id: userId,
        record_status: "A",
      },
      serviceEvent,
    );

    return { key: `ss_${rawValue}` };
  }

  async revokeKey(userId: number, logContext?: IRequestLogContext): Promise<{ revoked: boolean }> {
    const serviceEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "SERVICE", "Revoking API key")
      : undefined;

    await this.db.update<ITbSsApiKey>(
      "tb_ss_api_key",
      { user_id: userId, record_status: "A" },
      { record_status: "D", updated_dt: Date.now(), updated_by_id: userId },
      serviceEvent,
    );

    return { revoked: true };
  }
}
