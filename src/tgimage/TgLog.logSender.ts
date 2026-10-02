import { LoggingUtilities, TelegramLogMessage } from "../utils/logging/LoggingUtilities.js";

// Telegram only links public URLs — <a href> to localhost is dropped (and a
// localhost button URL would fail the whole send with BUTTON_URL_INVALID).
const isPublicUrl = (url: string) => /^https:\/\//.test(url) && !/^https:\/\/(localhost|127\.|\[::1\])/.test(url);

// Registers the Telegram send closure — the target chat id is passed in per
// call (see LoggingUtilities.flush()'s telegramChatIds list), resolved by
// RestRequestLogger.ts against every currently subscribed chat in
// tb_tg_stats_whitelist, not a single chat fixed at boot.
export function setupTelegramLogSender(): void {
  const token = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
  if (!token) return;

  LoggingUtilities.setLogSender(({ html, logSearcherUrl }: TelegramLogMessage, chatId: number) => {
    let text = html;

    if (logSearcherUrl) {
      const href = logSearcherUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      text += isPublicUrl(logSearcherUrl)
        ? `\n<a href="${href}">View Verbose Logs</a>`
        : // Dev (localhost): Telegram won't link it — show the URL tap-to-copy instead
          `\nView Verbose Logs: <code>${href}</code>`;
    }

    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: "HTML",
        text,
        link_preview_options: { is_disabled: true },
      }),
    }).catch(() => {});
  });
}
