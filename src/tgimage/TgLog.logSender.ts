import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

// Registers the Telegram send closure — the target chat id is passed in per
// call (see LoggingUtilities.flush()'s telegramChatIds list), resolved by
// RestRequestLogger.ts against every currently subscribed chat in
// tb_tg_stats_whitelist, not a single chat fixed at boot.
export function setupTelegramLogSender(): void {
  const token = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
  if (!token) return;

  LoggingUtilities.setLogSender((text: string, chatId: number) => {
    const payload = text.length > 3900 ? text.slice(0, 3890) + "\n[...]" : text;
    const escaped = payload.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, parse_mode: "HTML", text: `<pre>${escaped}</pre>` }),
    }).catch(() => {});
  });
}
