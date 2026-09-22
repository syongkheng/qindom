import KnexSqlUtilities from "../KnexSqlUtilities.js";
import { ITbTelegramLogSubscription } from "../../models/databases/tb_telegram_log_subscription.js";
import { TELEGRAM_LOG_MODULE_KEYS } from "./TelegramLogModules.js";

const TABLE = "tb_telegram_log_subscription";

export interface TelegramLogSubscriptionRow {
  key: string;
  label: string;
  enabled: boolean;
}

// Short-lived in-memory cache so the per-request enforcement check
// (RestRequestLogger's res.on("finish", ...)) doesn't hit the DB on every
// single request — invalidated immediately on any toggle.
const CACHE_TTL_MS = 30_000;
const enabledCache = new Map<string, { value: boolean; expiresAt: number }>();

function cacheKey(chatId: number, moduleKey: string): string {
  return `${chatId}:${moduleKey}`;
}

export class TelegramLogSubscriptionService {
  constructor(private db: KnexSqlUtilities) {}

  async listForChat(chatId: number): Promise<TelegramLogSubscriptionRow[]> {
    const rows = await this.db.raw<ITbTelegramLogSubscription[]>(
      `SELECT module_key, is_enabled FROM ${TABLE} WHERE chat_id = ? AND record_status = 'A'`,
      [chatId],
    );
    const overrides = new Map(rows.map((r) => [r.module_key, !!r.is_enabled]));

    return TELEGRAM_LOG_MODULE_KEYS.map(({ key, label }) => ({
      key,
      label,
      enabled: overrides.get(key) ?? true,
    }));
  }

  async setEnabled(chatId: number, moduleKey: string, enabled: boolean): Promise<void> {
    const now = Date.now();
    const existing = await this.db.findOne<ITbTelegramLogSubscription>(TABLE, {
      chat_id: chatId,
      module_key: moduleKey,
      record_status: "A",
    });

    if (existing) {
      await this.db.update<ITbTelegramLogSubscription>(
        TABLE,
        { id: existing.id },
        { is_enabled: enabled ? 1 : 0, updated_dt: now },
      );
    } else {
      await this.db.insert<ITbTelegramLogSubscription>(TABLE, {
        chat_id: chatId,
        module_key: moduleKey,
        is_enabled: enabled ? 1 : 0,
        created_dt: now,
      });
    }

    enabledCache.set(cacheKey(chatId, moduleKey), { value: enabled, expiresAt: now + CACHE_TTL_MS });
  }

  async isEnabled(chatId: number, moduleKey: string): Promise<boolean> {
    const key = cacheKey(chatId, moduleKey);
    const cached = enabledCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const row = await this.db.findOne<ITbTelegramLogSubscription>(TABLE, {
      chat_id: chatId,
      module_key: moduleKey,
      record_status: "A",
    });
    const enabled = row ? !!row.is_enabled : true;
    enabledCache.set(key, { value: enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return enabled;
  }
}
