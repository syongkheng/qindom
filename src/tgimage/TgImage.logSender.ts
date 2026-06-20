import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { TgImageService } from "./TgImage.service.js";

export async function setupTelegramLogSender(db: KnexSqlUtilities): Promise<void> {
  const chatId = await new TgImageService(db).getStorageChatId();
  const token = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) return;
  LoggingUtilities.setLogSender((text) => {
    const payload = text.length > 3900 ? text.slice(0, 3890) + "\n[...]" : text;
    const escaped = payload.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, parse_mode: "HTML", text: `<pre>${escaped}</pre>` }),
    }).catch(() => {});
  });
}
