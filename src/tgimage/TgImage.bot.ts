import TelegramBot, { type Message } from "node-telegram-bot-api";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { TgImageService } from "./TgImage.service.js";
import { escapeTelegramHtml, getTelegramBotToken, TELEGRAM_BOT_TOKEN_ENV } from "../utils/TelegramUtilities.js";

const CONTACT_EMAIL = "yongkhengs@gmail.com";
const RECENT_FILES_LIMIT = 10;
const KB = 1024;
const MB = 1024 * 1024;

const ADMIN_MENU = "Commands:\n  /stats — hosting statistics\n  /list — recent files\n  /help — show this message";
const ACCESS_DENIED = "⛔ Access denied.";

type CommandHandler = (msg: Message) => Promise<void>;

/**
 * The CDN bot (polling). Whitelisted admins (`tb_tg_stats_whitelist`) get `/stats` and `/list`;
 * their `/start` in a private chat stores the chat id that uploads and log alerts go to.
 * Not started when the bot token isn't configured.
 */
export async function initTgImageBot(db: KnexSqlUtilities): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) {
    LoggingUtilities.service.info("TgImageBot", `${TELEGRAM_BOT_TOKEN_ENV} not set — bot not started`);
    return;
  }

  const svc = new TgImageService(db);
  const bot = new TelegramBot(token, { polling: true });

  LoggingUtilities.service.info("TgImageBot", "Telegram bot started (polling)");

  // The library doesn't await handlers: log a failure instead of leaving an unhandled rejection.
  const command = (name: string, handler: CommandHandler) =>
    bot.onText(new RegExp(`\\/${name}`), (msg) => {
      handler(msg).catch((err) => LoggingUtilities.service.error(`TgImageBot./${name}`, toMessage(err)));
    });

  command("start", async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from!.id;
    if (!(await svc.isWhitelisted(fromId))) {
      await bot.sendMessage(
        chatId,
        "⛔ You don't have access to this bot.\n\n" +
          `If you should have access (e.g. to receive Telegram log alerts), contact ${CONTACT_EMAIL} ` +
          `and include your Telegram user ID: ${fromId}`,
      );
      return;
    }
    if (msg.chat.type === "private") {
      await svc.storeAdminChatId(fromId, chatId);
    }
    await bot.sendMessage(
      chatId,
      "👋 Welcome, admin! You're now set up to receive Telegram log alerts for all backend " +
        `modules by default — contact ${CONTACT_EMAIL} to fine-tune which modules alert you.\n\n${ADMIN_MENU}`,
    );
  });

  command("help", async (msg) => {
    if (!(await svc.isWhitelisted(msg.from!.id))) return;
    await bot.sendMessage(msg.chat.id, ADMIN_MENU);
  });

  command("stats", async (msg) => {
    const chatId = msg.chat.id;
    if (!(await svc.isWhitelisted(msg.from!.id))) {
      await bot.sendMessage(chatId, ACCESS_DENIED);
      return;
    }
    const stats = await svc.getStats();
    const sizeMb = (stats.totalSizeBytes / MB).toFixed(2);
    await bot.sendMessage(
      chatId,
      `📊 <b>Image Hosting Stats</b>\n\nFiles: <code>${stats.totalFiles}</code>\nTotal size: <code>${sizeMb} MB</code>`,
      { parse_mode: "HTML" },
    );
  });

  command("list", async (msg) => {
    const chatId = msg.chat.id;
    if (!(await svc.isWhitelisted(msg.from!.id))) {
      await bot.sendMessage(chatId, ACCESS_DENIED);
      return;
    }
    const items = await svc.listRecent(RECENT_FILES_LIMIT);
    if (!items.length) {
      await bot.sendMessage(chatId, "No files stored yet.");
      return;
    }
    const lines = items.map((item) => {
      const name = item.fileName ?? item.mimeType ?? "file";
      const sizeKb = item.sizeInBytes ? ` (${(item.sizeInBytes / KB).toFixed(1)} KB)` : "";
      return `• <code>${escapeTelegramHtml(item.shortCode)}</code> — ${escapeTelegramHtml(name)}${sizeKb}`;
    });
    await bot.sendMessage(chatId, `📁 <b>Recent Files (last ${RECENT_FILES_LIMIT})</b>\n\n${lines.join("\n")}`, {
      parse_mode: "HTML",
    });
  });

  bot.on("polling_error", (err) => {
    LoggingUtilities.service.error("TgImageBot.polling", err.message);
  });
}
