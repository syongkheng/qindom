import { LoggingUtilities, TelegramLogMessage } from "./LoggingUtilities.js";
import { escapeTelegramHtmlAttribute, getTelegramBotToken, sendTelegramHtml } from "../TelegramUtilities.js";
import { toMessage } from "../ErrorUtilities.js";

const LOG_LABEL = "TelegramLogSender";
const PUBLIC_URL_PATTERN = /^https:\/\//;
const LOCAL_URL_PATTERN = /^https:\/\/(localhost|127\.|\[::1\])/;

// Telegram only links public URLs: <a href> to localhost is dropped (and a
// localhost button URL would fail the whole send with BUTTON_URL_INVALID).
const isPublicUrl = (url: string) => PUBLIC_URL_PATTERN.test(url) && !LOCAL_URL_PATTERN.test(url);

/** The alert text: the compact access-log line plus a link (or, in dev, a copyable URL) to the Log Searcher. */
export function buildLogAlertHtml({ html, logSearcherUrl }: TelegramLogMessage): string {
  if (!logSearcherUrl) return html;
  const href = escapeTelegramHtmlAttribute(logSearcherUrl);
  return isPublicUrl(logSearcherUrl)
    ? `${html}\n<a href="${href}">View Verbose Logs</a>`
    : // Dev (localhost): Telegram won't link it, so show the URL tap-to-copy instead
      `${html}\nView Verbose Logs: <code>${href}</code>`;
}

/**
 * Registers LoggingUtilities' Telegram transport (called once at boot, after dotenv). The target
 * chat is passed per call (see `LoggingUtilities.request.flush`'s `telegramChatIds`, resolved by
 * RestRequestLogger against every subscribed chat in `tb_tg_stats_whitelist`). No token → no alerts.
 * Fire-and-forget: a failed send only writes a console warning (never the request log, never a throw).
 */
export function setupTelegramLogSender(): void {
  if (!getTelegramBotToken()) return;

  LoggingUtilities.setLogSender((message: TelegramLogMessage, chatId: number) => {
    sendTelegramHtml(chatId, buildLogAlertHtml(message)).catch((err) =>
      LoggingUtilities.service.warn(LOG_LABEL, `Log alert not sent: ${toMessage(err)}`),
    );
  });
}
