import TelegramBot from "node-telegram-bot-api";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { TgImageService } from "./TgImage.service.js";

const ADMIN_MENU =
  "Commands:\n  /stats — hosting statistics\n  /list — recent files\n  /help — show this message";

export async function initTgImageBot(db: KnexSqlUtilities): Promise<void> {
  const token = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
  if (!token) {
    LoggingUtilities.service.info("TgImageBot", "AWENSE_CDN_TELEGRAM_BOT_TOKEN not set — CDN bot not started");
    return;
  }

  const svc = new TgImageService(db);
  const bot = new TelegramBot(token, { polling: true });

  LoggingUtilities.service.info("TgImageBot", "CDN bot started (polling)");

  async function checkAdmin(fromId: number): Promise<boolean> {
    return svc.isWhitelisted(fromId);
  }

  // ─── /start ───────────────────────────────────────────────────────────────

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from!.id;
    const isAdmin = await checkAdmin(fromId);
    if (!isAdmin) {
      await bot.sendMessage(chatId, "⛔ You don't have access to this bot.");
      return;
    }
    if (msg.chat.type === "private") {
      await svc.storeAdminChatId(fromId, chatId);
    }
    await bot.sendMessage(chatId, `👋 Welcome, admin!\n\n${ADMIN_MENU}`);
  });

  // ─── /help ────────────────────────────────────────────────────────────────

  bot.onText(/\/help/, async (msg) => {
    if (!await checkAdmin(msg.from!.id)) return;
    await bot.sendMessage(msg.chat.id, ADMIN_MENU);
  });

  // ─── /stats ───────────────────────────────────────────────────────────────

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    if (!await checkAdmin(msg.from!.id)) {
      await bot.sendMessage(chatId, "⛔ Access denied.");
      return;
    }
    const stats = await svc.getStats();
    const sizeMb = (stats.totalSizeBytes / (1024 * 1024)).toFixed(2);
    await bot.sendMessage(
      chatId,
      `📊 <b>Image Hosting Stats</b>\n\nFiles: <code>${stats.totalFiles}</code>\nTotal size: <code>${sizeMb} MB</code>`,
      { parse_mode: "HTML" },
    );
  });

  // ─── /list ────────────────────────────────────────────────────────────────

  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
    if (!await checkAdmin(msg.from!.id)) {
      await bot.sendMessage(chatId, "⛔ Access denied.");
      return;
    }
    const items = await svc.listRecent(10);
    if (!items.length) {
      await bot.sendMessage(chatId, "No files stored yet.");
      return;
    }
    const lines = items.map((item) => {
      const name = item.file_name ?? item.mime_type ?? "file";
      const sizeKb = item.size_in_bytes ? ` (${(item.size_in_bytes / 1024).toFixed(1)} KB)` : "";
      return `• <code>${item.short_code}</code> — ${name}${sizeKb}`;
    });
    await bot.sendMessage(
      chatId,
      `📁 <b>Recent Files (last 10)</b>\n\n${lines.join("\n")}`,
      { parse_mode: "HTML" },
    );
  });

  bot.on("polling_error", (err) => {
    LoggingUtilities.service.error("TgImageBot.polling", err.message);
  });
}
