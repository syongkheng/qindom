/**
 * Shared Telegram Bot API plumbing for the one CDN bot (`AWENSE_CDN_TELEGRAM_BOT_TOKEN`): the
 * request-log alerts (`logging/TelegramLogSender.ts`), the wedding visit notifier and the image
 * CDN (`tgimage`) all use it. Callers decide what a missing token means (skip vs 500).
 */

export const TELEGRAM_API_URL = "https://api.telegram.org";
export const TELEGRAM_BOT_TOKEN_ENV = "AWENSE_CDN_TELEGRAM_BOT_TOKEN";

/** Read lazily: dotenv runs in index.ts after ESM imports are evaluated. Blank counts as unset. */
export function getTelegramBotToken(): string | undefined {
  return process.env[TELEGRAM_BOT_TOKEN_ENV] || undefined;
}

/** Telegram `parse_mode: "HTML"` only needs these three escaped in text. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Text placed inside an HTML attribute (`<a href="…">`) also needs `"` escaped. */
export function escapeTelegramHtmlAttribute(text: string): string {
  return escapeTelegramHtml(text).replace(/"/g, "&quot;");
}

/**
 * `sendMessage` with `parse_mode: "HTML"` and link previews off. `html` must already be escaped.
 * Throws when the token is missing, on network errors and on a non-OK answer; callers that are
 * fire-and-forget must catch.
 */
export async function sendTelegramHtml(chatId: number, html: string): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) throw new Error(`${TELEGRAM_BOT_TOKEN_ENV} is not set`);
  const res = await fetch(`${TELEGRAM_API_URL}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      parse_mode: "HTML",
      text: html,
      link_preview_options: { is_disabled: true },
    }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage answered ${res.status}`);
}
