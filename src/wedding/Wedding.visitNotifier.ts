import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { MailerUtilities } from "../utils/MailerUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { getTelegramBotToken, sendTelegramHtml } from "../utils/TelegramUtilities.js";
import { WeddingVisit } from "./Wedding.types.js";

const LOG_LABEL = "WeddingVisitNotifier";

const esc = MailerUtilities.escapeHtml;

export interface ParsedUserAgent {
  device: string;
  os: string;
  browser: string;
}

/** First pattern that matches wins, so in-app browsers come before the engines they wrap. */
const OS_PATTERNS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];
const BROWSER_PATTERNS: Array<[RegExp, string]> = [
  [/MicroMessenger/, "WeChat"],
  [/WhatsApp/, "WhatsApp"],
  [/Instagram/, "Instagram"],
  [/FBAN|FBAV/, "Facebook"],
  [/Telegram/, "Telegram"],
  [/Edg\//, "Edge"],
  [/CriOS|Chrome\//, "Chrome"],
  [/FxiOS|Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];
const TABLET_PATTERN = /iPad|Tablet/;
const MOBILE_PATTERN = /Mobi|iPhone|Android/;

const firstMatch = (ua: string, patterns: Array<[RegExp, string]>, fallback: string) =>
  patterns.find(([pattern]) => pattern.test(ua))?.[1] ?? fallback;

export function parseUserAgent(ua: string): ParsedUserAgent {
  return {
    device: TABLET_PATTERN.test(ua) ? "Tablet" : MOBILE_PATTERN.test(ua) ? "Mobile" : "Desktop",
    os: firstMatch(ua, OS_PATTERNS, "Unknown OS"),
    browser: firstMatch(ua, BROWSER_PATTERNS, "Unknown browser"),
  };
}

/** Telegram HTML message for one visit. Every visitor-supplied value is escaped. */
export function renderVisitMessage(visit: WeddingVisit): string {
  const { device, os, browser } = parseUserAgent(visit.userAgent);
  const lines = [
    "👀 <b>Someone is visiting the wedding page</b>",
    "",
    `📱 ${esc(device)} · ${esc(os)} · ${esc(browser)}`,
    visit.screen ? `🖥 Screen: ${esc(visit.screen)}` : "",
    visit.language ? `🌐 Language: ${esc(visit.language)}` : "",
    visit.timezone ? `🕒 Timezone: ${esc(visit.timezone)}` : "",
    `📍 IP: <code>${esc(visit.ip)}</code>`,
    `🔗 From: ${visit.referrer ? esc(visit.referrer) : "direct / unknown"}`,
    visit.path ? `📄 Page: <code>${esc(visit.path)}</code>` : "",
  ];
  // Drop the empty optional lines but keep the one deliberate blank after the title.
  return lines.filter((line, i) => line !== "" || (i > 0 && lines[i - 1] !== "")).join("\n");
}

/** POST /wedding/visit: relays a page-view alert to every subscribed Telegram chat. Nothing is stored. */
export class WeddingVisitNotifier {
  private readonly subscriptions: TelegramLogSubscriptionService;

  constructor(db: KnexSqlUtilities) {
    this.subscriptions = new TelegramLogSubscriptionService(db);
  }

  /** Fire-and-forget: never throws (failures are logged), so it can't affect the visitor's page or the process. */
  async notify(visit: WeddingVisit): Promise<void> {
    try {
      if (!getTelegramBotToken()) return;

      const text = renderVisitMessage(visit);
      const chatIds = await this.subscriptions.listSubscribedChatIdsCached();
      await Promise.all(chatIds.map((chatId) => sendTelegramHtml(chatId, text)));
    } catch (err) {
      LoggingUtilities.service.warn(LOG_LABEL, `Visit alert not sent: ${toMessage(err)}`);
    }
  }
}
