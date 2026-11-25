import crypto from "crypto";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { ITbSsApiKey } from "../models/databases/tb_ss_api_key.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { SsApiKeyGeneratedDto, SsApiKeyRevokedDto, SsApiKeyStatusDto } from "./SsApiKey.types.js";

/** Prefix stored in `api_key_prefix` and shown as `ss_<hex>`; `RequestApiKeyFilter("ss")` accepts it. */
export const SS_KEY_PREFIX = "ss";

const SS_API_KEY_TABLE = "tb_ss_api_key";
const KEY_RANDOM_BYTES = 32;
const KEY_HINT_LENGTH = 5;
const DEFAULT_KEY_NAME = "Siri Shortcuts";

const NO_KEY: SsApiKeyStatusDto = { hasKey: false, name: null, createdDt: null, keyHint: null };

/**
 * The "ss_" API key used by every Siri Shortcuts / Scriptable integration
 * (Apple Pay ingestion, to-do widget). One active key per user; only its SHA-256 hash is stored.
 */
export class SsApiKeyService {
  constructor(private readonly db: KnexSqlUtilities) {}

  async getKeyStatus(userId: number, logContext?: IRequestLogContext): Promise<SsApiKeyStatusDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Get API key status");
    const existing = await this.db.findOne<ITbSsApiKey>(
      SS_API_KEY_TABLE,
      { user_id: userId, record_status: RecordStatus.ACTIVE },
      ["id", "name", "key_hint", "created_dt"],
      event,
    );
    if (!existing) return NO_KEY;
    return {
      hasKey: true,
      name: existing.name ?? null,
      createdDt: existing.created_dt,
      keyHint: existing.key_hint ?? null,
    };
  }

  /** Revokes the current key (if any) and issues a new one. The raw key is only ever returned here. */
  async generateKey(userId: number, logContext?: IRequestLogContext): Promise<SsApiKeyGeneratedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Generate API key");
    const now = Date.now();

    await this.deactivateActiveKey(userId, now, event);

    const rawValue = crypto.randomBytes(KEY_RANDOM_BYTES).toString("hex");
    await this.db.insert<ITbSsApiKey>(
      SS_API_KEY_TABLE,
      {
        user_id: userId,
        api_key_prefix: SS_KEY_PREFIX,
        api_key_hash: sha256Hex(rawValue),
        key_hint: rawValue.slice(0, KEY_HINT_LENGTH),
        name: DEFAULT_KEY_NAME,
        created_dt: now,
        created_by_id: userId,
        record_status: RecordStatus.ACTIVE,
      },
      event,
    );

    return { key: `${SS_KEY_PREFIX}_${rawValue}` };
  }

  /**
   * Renames the active key's label only. The key value/hash is untouched, so an
   * already-configured Shortcut keeps working (unlike generateKey).
   */
  async renameKey(userId: number, name: string, logContext?: IRequestLogContext): Promise<SsApiKeyStatusDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Rename API key");
    const activeKey = { user_id: userId, record_status: RecordStatus.ACTIVE };

    const existing = await this.db.findOne<ITbSsApiKey>(SS_API_KEY_TABLE, activeKey, ["id"], event);
    if (!existing) throw new Exceptions.NotFound("No active API key");

    await this.db.update<ITbSsApiKey>(
      SS_API_KEY_TABLE,
      activeKey,
      { name, updated_dt: Date.now(), updated_by_id: userId },
      event,
    );
    return this.getKeyStatus(userId, logContext);
  }

  async revokeKey(userId: number, logContext?: IRequestLogContext): Promise<SsApiKeyRevokedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Revoke API key");
    await this.deactivateActiveKey(userId, Date.now(), event);
    return { revoked: true };
  }

  private async deactivateActiveKey(userId: number, now: number, event?: IRequestLogEvent): Promise<void> {
    await this.db.update<ITbSsApiKey>(
      SS_API_KEY_TABLE,
      { user_id: userId, record_status: RecordStatus.ACTIVE },
      { record_status: RecordStatus.DELETED, updated_dt: now, updated_by_id: userId },
      event,
    );
  }
}
