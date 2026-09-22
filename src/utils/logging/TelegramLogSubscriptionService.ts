import KnexSqlUtilities from "../KnexSqlUtilities.js";
import { ITbTelegramLogSubscription } from "../../models/databases/tb_telegram_log_subscription.js";
import { TELEGRAM_LOG_MODULE_KEYS } from "./TelegramLogModules.js";

const TABLE = "tb_telegram_log_subscription";
const WHITELIST_TABLE = "tb_tg_stats_whitelist";

export interface TelegramSubscribedChat {
  chatId: number;
  label: string;
}

export interface TelegramLogMatrixRow {
  chatId: number;
  label: string;
  enabled: Record<string, boolean>;
}

export interface TelegramLogMatrix {
  modules: { key: string; label: string }[];
  chats: TelegramLogMatrixRow[];
}

// Short-lived in-memory caches so the per-request enforcement check
// (RestRequestLogger's res.on("finish", ...)) doesn't hit the DB on every
// single request — invalidated immediately on any toggle (enabledCache only;
// the subscribed-chats list simply expires and re-queries, since new chats
// only ever appear via a whitelisted admin DMing the bot, not urgently live).
const CACHE_TTL_MS = 30_000;
const enabledCache = new Map<string, { value: boolean; expiresAt: number }>();
let subscribedChatsCache: { value: number[]; expiresAt: number } | null = null;

function cacheKey(chatId: number, moduleKey: string): string {
  return `${chatId}:${moduleKey}`;
}

export class TelegramLogSubscriptionService {
  constructor(private db: KnexSqlUtilities) {}

  // Every whitelisted admin who has DM'd the bot (and so has a captured
  // telegram_chat_id) — NOT just the first one, unlike TgImageService's
  // getStorageChatId() (which stays as-is for its own unrelated CDN-upload use).
  async listSubscribedChats(): Promise<TelegramSubscribedChat[]> {
    const rows = await this.db.raw<{ telegram_user_id: number; telegram_chat_id: number }[]>(
      `SELECT telegram_user_id, telegram_chat_id FROM ${WHITELIST_TABLE}
       WHERE record_status = 'A' AND telegram_chat_id IS NOT NULL
       ORDER BY added_dt ASC`,
    );
    return rows.map((r) => ({ chatId: r.telegram_chat_id, label: `User ${r.telegram_user_id}` }));
  }

  async listSubscribedChatIdsCached(): Promise<number[]> {
    if (subscribedChatsCache && subscribedChatsCache.expiresAt > Date.now()) return subscribedChatsCache.value;
    const chats = await this.listSubscribedChats();
    const value = chats.map((c) => c.chatId);
    subscribedChatsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  async listMatrix(): Promise<TelegramLogMatrix> {
    const chats = await this.listSubscribedChats();
    const rows = await this.db.raw<ITbTelegramLogSubscription[]>(
      `SELECT chat_id, module_key, is_enabled FROM ${TABLE} WHERE record_status = 'A'`,
    );
    const overridesByChat = new Map<number, Map<string, boolean>>();
    for (const row of rows) {
      if (!overridesByChat.has(row.chat_id)) overridesByChat.set(row.chat_id, new Map());
      overridesByChat.get(row.chat_id)!.set(row.module_key, !!row.is_enabled);
    }

    return {
      modules: TELEGRAM_LOG_MODULE_KEYS,
      chats: chats.map(({ chatId, label }) => {
        const overrides = overridesByChat.get(chatId);
        const enabled: Record<string, boolean> = {};
        for (const { key } of TELEGRAM_LOG_MODULE_KEYS) {
          enabled[key] = overrides?.get(key) ?? true;
        }
        return { chatId, label, enabled };
      }),
    };
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
