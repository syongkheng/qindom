import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";

export interface VisitInfo {
  ip: string;
  userAgent: string;
  language?: string;
  timezone?: string;
  screen?: string;
  referrer?: string;
  path?: string;
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

// Same IP is reported at most once per window, so a refresh or a flaky
// connection doesn't spam the chat. In-memory only — nothing is persisted, and
// the counters reset on restart.
const DEDUPE_WINDOW_MS = 30 * 60_000;
const lastSeenByIp = new Map<string, number>();
let visitsToday = { day: "", count: 0 };

function parseUserAgent(ua: string): { device: string; os: string; browser: string } {
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  const browser = /MicroMessenger/.test(ua)
    ? "WeChat"
    : /WhatsApp/.test(ua)
      ? "WhatsApp"
      : /Instagram/.test(ua)
        ? "Instagram"
        : /FBAN|FBAV/.test(ua)
          ? "Facebook"
          : /Telegram/.test(ua)
            ? "Telegram"
            : /Edg\//.test(ua)
              ? "Edge"
              : /CriOS|Chrome\//.test(ua)
                ? "Chrome"
                : /FxiOS|Firefox\//.test(ua)
                  ? "Firefox"
                  : /Safari\//.test(ua)
                    ? "Safari"
                    : "Unknown browser";
  const device = /iPad|Tablet/.test(ua) ? "Tablet" : /Mobi|iPhone|Android/.test(ua) ? "Mobile" : "Desktop";
  return { device, os, browser };
}

export class WeddingVisitNotifier {
  private readonly subscriptions: TelegramLogSubscriptionService;

  constructor(db: KnexSqlUtilities) {
    this.subscriptions = new TelegramLogSubscriptionService(db);
  }

  static sanitise(body: Record<string, unknown> | undefined): Omit<VisitInfo, "ip" | "userAgent"> {
    return {
      language: clip(body?.language, 20),
      timezone: clip(body?.timezone, 60),
      screen: clip(body?.screen, 20),
      referrer: clip(body?.referrer, 200),
      path: clip(body?.path, 100),
    };
  }

  /** Fire-and-forget: never throws, never blocks the visitor's page. */
  async notify(visit: VisitInfo): Promise<void> {
    try {
      const token = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
      if (!token) return;

      const now = Date.now();
      const last = lastSeenByIp.get(visit.ip);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      lastSeenByIp.set(visit.ip, now);
      for (const [ip, seenAt] of lastSeenByIp) {
        if (now - seenAt >= DEDUPE_WINDOW_MS) lastSeenByIp.delete(ip);
      }

      const day = new Date(now).toISOString().slice(0, 10);
      if (visitsToday.day !== day) visitsToday = { day, count: 0 };
      visitsToday.count += 1;

      const { device, os, browser } = parseUserAgent(visit.userAgent);
      const lines = [
        "👀 <b>Someone is visiting the wedding page</b>",
        `Visit #${visitsToday.count} today (UTC)`,
        "",
        `📱 ${escapeHtml(device)} · ${escapeHtml(os)} · ${escapeHtml(browser)}`,
        visit.screen ? `🖥 Screen: ${escapeHtml(visit.screen)}` : "",
        visit.language ? `🌐 Language: ${escapeHtml(visit.language)}` : "",
        visit.timezone ? `🕒 Timezone: ${escapeHtml(visit.timezone)}` : "",
        `📍 IP: <code>${escapeHtml(visit.ip)}</code>`,
        `🔗 From: ${visit.referrer ? escapeHtml(visit.referrer) : "direct / unknown"}`,
        visit.path ? `📄 Page: <code>${escapeHtml(visit.path)}</code>` : "",
      ].filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""));
      const text = lines.join("\n");

      const chatIds = await this.subscriptions.listSubscribedChatIdsCached();
      await Promise.all(
        chatIds.map((chatId) =>
          fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              parse_mode: "HTML",
              text,
              link_preview_options: { is_disabled: true },
            }),
          }).catch(() => {}),
        ),
      );
    } catch {
      // Analytics must never affect the page.
    }
  }
}
