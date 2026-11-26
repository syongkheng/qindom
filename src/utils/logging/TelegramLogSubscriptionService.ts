import KnexSqlUtilities from "../KnexSqlUtilities.js";
import { LoggingUtilities } from "./LoggingUtilities.js";
import { RecordStatus } from "../../constants/RecordStatus.js";
import { Time } from "../../constants/Time.js";
import { IRequestLogContext, IRequestLogEvent } from "../../models/IRequestLogContext.js";
import { ITB_TELEGRAM_LOG_SUBSCRIPTION } from "../../models/databases/tb_telegram_log_subscription.js";
import { TELEGRAM_LOG_MODULE_KEYS, TelegramLogModuleKey } from "./TelegramLogModules.js";

const TELEGRAM_LOG_SUBSCRIPTION_TABLE = "tb_telegram_log_subscription";
/** Owned by `tgimage` (TgImageService); read here for the list of chats to alert. */
const TG_STATS_WHITELIST_TABLE = "tb_tg_stats_whitelist";

/** A module with no override row is on (alerts are opt-out per chat). */
const DEFAULT_ENABLED = true;
const ENABLED_FLAG = 1;
const DISABLED_FLAG = 0;

const SUBSCRIBED_CHATS_SQL = `SELECT telegram_user_id, telegram_chat_id FROM ${TG_STATS_WHITELIST_TABLE}
  WHERE record_status = ? AND telegram_chat_id IS NOT NULL
  ORDER BY added_dt ASC`;
const OVERRIDES_SQL = `SELECT chat_id, module_key, is_enabled FROM ${TELEGRAM_LOG_SUBSCRIPTION_TABLE} WHERE record_status = ?`;

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
  modules: TelegramLogModuleKey[];
  chats: TelegramLogMatrixRow[];
}

type OverrideRow = Pick<ITB_TELEGRAM_LOG_SUBSCRIPTION, "chat_id" | "module_key" | "is_enabled">;

// Short-lived in-memory caches so the per-request enforcement check
// (RestRequestLogger's res.on("finish", ...)) doesn't hit the DB on every
// single request. A toggle refreshes its enabledCache entry at once; the
// subscribed-chats list simply expires and re-queries (new chats only appear
// when a whitelisted admin DMs the bot, which isn't urgent).
const CACHE_TTL_MS = 30 * Time.SECOND_MS;
const enabledCache = new Map<string, { value: boolean; expiresAt: number }>();
let subscribedChatsCache: { value: number[]; expiresAt: number } | null = null;

function cacheKey(chatId: number, moduleKey: string): string {
  return `${chatId}:${moduleKey}`;
}

/** Test hook: forget every cached lookup. */
export function clearTelegramLogSubscriptionCaches(): void {
  enabledCache.clear();
  subscribedChatsCache = null;
}

/**
 * Owns `tb_telegram_log_subscription`: which subscribed Telegram chat gets which module's
 * successful-request alerts (errors always go to every chat, see RestRequestLogger).
 */
export class TelegramLogSubscriptionService {
  constructor(private db: KnexSqlUtilities) {}

  // Every whitelisted admin who has DM'd the bot (and so has a captured
  // telegram_chat_id), not just the first one like TgImageService's storage chat.
  async listSubscribedChats(logContext?: IRequestLogContext): Promise<TelegramSubscribedChat[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List subscribed Telegram chats");
    return this.subscribedChats(event);
  }

  async listSubscribedChatIdsCached(logContext?: IRequestLogContext): Promise<number[]> {
    const event = LoggingUtilities.request.branch(logContext, "CACHE", "Subscribed Telegram chat ids");
    if (subscribedChatsCache && subscribedChatsCache.expiresAt > Date.now()) {
      if (event) event.detail = "cache hit";
      return subscribedChatsCache.value;
    }
    const value = (await this.subscribedChats(event)).map((c) => c.chatId);
    subscribedChatsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    if (event) event.detail = "cache miss";
    return value;
  }

  async listMatrix(logContext?: IRequestLogContext): Promise<TelegramLogMatrix> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Telegram log subscription matrix");
    const chats = await this.subscribedChats(event);
    const rows = await this.db.raw<OverrideRow[]>(OVERRIDES_SQL, [RecordStatus.ACTIVE], event);
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
          enabled[key] = overrides?.get(key) ?? DEFAULT_ENABLED;
        }
        return { chatId, label, enabled };
      }),
    };
  }

  async setEnabled(
    chatId: number,
    moduleKey: string,
    enabled: boolean,
    logContext?: IRequestLogContext,
  ): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", `Set Telegram alerts ${moduleKey}`);
    const now = Date.now();
    const flag = enabled ? ENABLED_FLAG : DISABLED_FLAG;
    const existing = await this.activeOverride(chatId, moduleKey, ["id"], event);

    if (existing) {
      await this.db.update<ITB_TELEGRAM_LOG_SUBSCRIPTION>(
        TELEGRAM_LOG_SUBSCRIPTION_TABLE,
        { id: existing.id },
        { is_enabled: flag, updated_dt: now },
        event,
      );
    } else {
      await this.db.insert<ITB_TELEGRAM_LOG_SUBSCRIPTION>(
        TELEGRAM_LOG_SUBSCRIPTION_TABLE,
        { chat_id: chatId, module_key: moduleKey, is_enabled: flag, created_dt: now },
        event,
      );
    }

    enabledCache.set(cacheKey(chatId, moduleKey), { value: enabled, expiresAt: now + CACHE_TTL_MS });
  }

  async isEnabled(chatId: number, moduleKey: string, logContext?: IRequestLogContext): Promise<boolean> {
    const key = cacheKey(chatId, moduleKey);
    const cached = enabledCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const event = LoggingUtilities.request.branch(logContext, "SERVICE", `Telegram alerts ${moduleKey}`);
    const row = await this.activeOverride(chatId, moduleKey, ["is_enabled"], event);
    const enabled = row ? !!row.is_enabled : DEFAULT_ENABLED;
    enabledCache.set(key, { value: enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return enabled;
  }

  private async subscribedChats(event?: IRequestLogEvent): Promise<TelegramSubscribedChat[]> {
    const rows = await this.db.raw<{ telegram_user_id: number; telegram_chat_id: number }[]>(
      SUBSCRIBED_CHATS_SQL,
      [RecordStatus.ACTIVE],
      event,
    );
    return rows.map((r) => ({ chatId: r.telegram_chat_id, label: `User ${r.telegram_user_id}` }));
  }

  private activeOverride(
    chatId: number,
    moduleKey: string,
    columns: readonly (keyof ITB_TELEGRAM_LOG_SUBSCRIPTION)[],
    event?: IRequestLogEvent,
  ): Promise<ITB_TELEGRAM_LOG_SUBSCRIPTION | undefined> {
    return this.db.findOne<ITB_TELEGRAM_LOG_SUBSCRIPTION>(
      TELEGRAM_LOG_SUBSCRIPTION_TABLE,
      { chat_id: chatId, module_key: moduleKey, record_status: RecordStatus.ACTIVE },
      columns,
      event,
    );
  }
}
