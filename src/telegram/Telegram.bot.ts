import TelegramBot from "node-telegram-bot-api";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { TelegramService } from "./Telegram.service";
import { extractMedia } from "./Telegram.utils";

let botInstance: TelegramBot | null = null;

export function getTelegramBot(): TelegramBot | null {
  return botInstance;
}

async function getLinkedUsername(svc: TelegramService, telegramUserId: number): Promise<string | null> {
  return svc.getLinkedUsername(telegramUserId);
}

export async function initTelegramBot(db: KnexSqlUtilities): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    LoggingUtilities.service.error("TelegramBot", "TELEGRAM_BOT_TOKEN not set — bot not started");
    return;
  }

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const svc = new TelegramService(db);

  if (webhookUrl) {
    // Webhook mode (production)
    botInstance = new TelegramBot(token);
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    await botInstance.setWebHook(`${webhookUrl}/api/telegram/webhook`, {
      secret_token: webhookSecret,
    } as Parameters<TelegramBot["setWebHook"]>[1]);
    LoggingUtilities.service.info("TelegramBot", `Webhook registered at ${webhookUrl}/api/telegram/webhook`);
  } else {
    // Polling mode (dev)
    botInstance = new TelegramBot(token, { polling: true });
    LoggingUtilities.service.info("TelegramBot", "Polling mode started");
  }

  const me = await botInstance.getMe();
  const botUsername = me.username ?? "";

  // ─── /start ───────────────────────────────────────────────────────────────

  botInstance.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const payload = match?.[1]?.trim();

    // Record DM chat ID so the API can send files to this user later
    if (msg.chat.type === "private") {
      await svc.setDmChatId(msg.from!.id, msg.chat.id).catch(() => {});
    }

    if (payload?.startsWith("get_")) {
      const id = payload.slice(4);
      const username = await getLinkedUsername(svc, msg.from!.id);
      if (!username) {
        await botInstance!.sendMessage(msg.chat.id, "❌ Your Telegram account is not linked. Use /link <token> first.");
        return;
      }
      try {
        const media = await svc.getMediaForBot(id, username);
        const sendFn = getSendFunction(botInstance!, media.file_type);
        await sendFn(msg.chat.id, media.telegram_file_id, { reply_markup: mediaActionKeyboard(id) });
      } catch {
        await botInstance!.sendMessage(msg.chat.id, "❌ File not found or you don't have access.");
      }
      return;
    }

    await botInstance!.sendMessage(
      msg.chat.id,
      "👋 Welcome to Awense Media Storage!\n\n" +
      "To get started, generate a link token from the app and send:\n" +
      "  /link <token>\n\n" +
      "Then send any media (photo, video, file, audio) to store it.\n\n" +
      "Commands:\n" +
      "  /get <id> — retrieve a file\n" +
      "  /list — show your 10 most recent files\n" +
      "  /delete <id> — delete a file\n" +
      "  /expire <id> <days> — set expiry (0 = never)\n" +
      "  /help — show this message"
    );
  });

  botInstance.onText(/\/help/, async (msg) => {
    await botInstance!.sendMessage(
      msg.chat.id,
      "Commands:\n" +
      "  /link <token> — link your Awense account\n" +
      "  /get <id> — retrieve a stored file\n" +
      "  /list — show your 10 most recent files\n" +
      "  /delete <id> — delete a file\n" +
      "  /expire <id> <days> — set expiry (0 = never)\n\n" +
      "Send any media to upload and store it."
    );
  });

  // ─── /link <token> ────────────────────────────────────────────────────────

  botInstance.onText(/\/link (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const token = match?.[1]?.trim().toUpperCase();

    if (!token) {
      await botInstance!.sendMessage(chatId, "Usage: /link <token>");
      return;
    }

    try {
      const dmChatId = msg.chat.type === "private" ? msg.chat.id : undefined;
      const username = await svc.linkAccount(
        msg.from!.id,
        msg.from?.username,
        token,
        dmChatId
      );
      await botInstance!.sendMessage(chatId, `✅ Linked to Awense account: ${username}`);
    } catch {
      await botInstance!.sendMessage(chatId, "❌ Invalid or expired token. Generate a new one from the app.");
    }
  });

  // ─── /get <id> ────────────────────────────────────────────────────────────

  botInstance.onText(/\/get (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const id = match?.[1]?.trim();

    if (!id) {
      await botInstance!.sendMessage(chatId, "Usage: /get <id>");
      return;
    }

    const username = await getLinkedUsername(svc, msg.from!.id);
    if (!username) {
      await botInstance!.sendMessage(chatId, "❌ Your Telegram account is not linked. Use /link <token> first.");
      return;
    }

    try {
      const media = await svc.getMediaForBot(id, username);
      const sendFn = getSendFunction(botInstance!, media.file_type);
      await sendFn(chatId, media.telegram_file_id, { reply_markup: mediaActionKeyboard(id) });
    } catch {
      await botInstance!.sendMessage(chatId, "❌ File not found or you don't have access.");
    }
  });

  // ─── /list ────────────────────────────────────────────────────────────────

  const PAGE_SIZE = 10;

  async function sendListPage(chatId: number, username: string, page: number): Promise<void> {
    const { items, total } = await svc.listRecentMedia(username, page, PAGE_SIZE);
    if (total === 0) {
      await botInstance!.sendMessage(chatId, "You have no stored files.");
      return;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const lines = items.map((m) => {
      const label = m.fileName ? escHtml(m.fileName) : m.fileType;
      return botUsername
        ? `<a href="https://t.me/${botUsername}?start=get_${m.id}">${m.id}</a>  ${label}`
        : `<code>${m.id}</code>  ${label}`;
    });

    const header = `📦 Files (page ${page + 1}/${totalPages}, ${total} total):`;
    const text = `${header}\n\n${lines.join("\n")}`;

    const navButtons: TelegramBot.InlineKeyboardButton[] = [];
    if (page > 0)              navButtons.push({ text: "⬅️ Prev", callback_data: `list:${page - 1}` });
    if (page + 1 < totalPages) navButtons.push({ text: "Next ➡️", callback_data: `list:${page + 1}` });

    await botInstance!.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: navButtons.length > 0 ? { inline_keyboard: [navButtons] } : undefined,
    });
  }

  botInstance.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
    const username = await getLinkedUsername(svc, msg.from!.id);
    if (!username) {
      await botInstance!.sendMessage(chatId, "❌ Your Telegram account is not linked. Use /link <token> first.");
      return;
    }
    await sendListPage(chatId, username, 0);
  });

  // ─── /delete <id> ────────────────────────────────────────────────────────

  botInstance.onText(/\/delete (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const id = match?.[1]?.trim();

    if (!id) {
      await botInstance!.sendMessage(chatId, "Usage: /delete <id>");
      return;
    }

    const username = await getLinkedUsername(svc, msg.from!.id);
    if (!username) {
      await botInstance!.sendMessage(chatId, "❌ Your Telegram account is not linked.");
      return;
    }

    try {
      await svc.deleteMediaByBot(id, username);
      await botInstance!.sendMessage(chatId, `🗑️ File ${id} deleted.`);
    } catch {
      await botInstance!.sendMessage(chatId, "❌ File not found or you don't have access.");
    }
  });

  // ─── /expire <id> <days> ─────────────────────────────────────────────────

  botInstance.onText(/\/expire (\S+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const id   = match?.[1]?.trim();
    const days = parseInt(match?.[2] ?? "");

    if (!id || isNaN(days)) {
      await botInstance!.sendMessage(chatId, "Usage: /expire <id> <days>  (use 0 for never)");
      return;
    }

    const username = await getLinkedUsername(svc, msg.from!.id);
    if (!username) {
      await botInstance!.sendMessage(chatId, "❌ Your Telegram account is not linked.");
      return;
    }

    try {
      await svc.setExpiryByBot(id, username, days);
      const msg_ = days === 0
        ? `✅ File ${id} set to never expire.`
        : `✅ File ${id} will expire in ${days} day(s).`;
      await botInstance!.sendMessage(chatId, msg_);
    } catch {
      await botInstance!.sendMessage(chatId, "❌ File not found or you don't have access.");
    }
  });

  // ─── /stats ───────────────────────────────────────────────────────────────

  // ─── Media upload ─────────────────────────────────────────────────────────

  botInstance.on("message", async (msg) => {
    // Skip command messages
    if (msg.text?.startsWith("/")) return;

    const chatId = msg.chat.id;
    const media = extractMedia(msg as Parameters<typeof extractMedia>[0]);
    if (!media) return;

    const username = await getLinkedUsername(svc, msg.from!.id);
    if (!username) {
      await botInstance!.sendMessage(chatId, "❌ Link your Awense account first. Get a token from the app and send /link <token>.");
      return;
    }

    try {
      const id = await svc.storeMedia({
        telegramUserId: msg.from!.id,
        ownerUsername:  username,
        fileId:         media.fileId,
        fileType:       media.fileType,
        fileName:       media.fileName,
        fileSize:       media.fileSize,
      });

      // Delete original upload from chat
      try {
        await botInstance!.deleteMessage(chatId, msg.message_id);
      } catch {
        // Best effort — bot may lack delete permissions in group chats
      }

      await botInstance!.sendMessage(chatId, `✅ Stored!\n\nID: <code>${id}</code>`, {
        parse_mode: "HTML",
        reply_markup: mediaActionKeyboard(id),
      });
    } catch (err) {
      LoggingUtilities.service.error("TelegramBot.upload", String(err));
      await botInstance!.sendMessage(chatId, "❌ Failed to store file. Please try again.");
    }
  });

  // ─── Inline button callbacks ──────────────────────────────────────────────

  botInstance.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    const data   = query.data ?? "";

    if (!chatId) return;

    const parts = data.split(":");
    const action = parts[0];

    // ── list pagination ───────────────────────────────────────────────────────
    if (action === "list") {
      const page = parseInt(parts[1] ?? "0");
      if (isNaN(page)) return;
      const username = await getLinkedUsername(svc, query.from.id);
      if (!username) {
        await botInstance!.answerCallbackQuery(query.id, { text: "❌ Account not linked." });
        return;
      }
      await botInstance!.answerCallbackQuery(query.id);
      await sendListPage(chatId, username, page);
      return;
    }

    // expire:DAYS:ID has 3 parts; others have 2
    const id = action === "expire" ? parts[2] : parts[1];
    if (!action || !id) return;

    const username = await getLinkedUsername(svc, query.from.id);
    if (!username) {
      await botInstance!.answerCallbackQuery(query.id, { text: "❌ Account not linked." });
      return;
    }

    if (action === "retrieve") {
      try {
        const media = await svc.getMediaForBot(id, username);
        const sendFn = getSendFunction(botInstance!, media.file_type);
        await sendFn(chatId, media.telegram_file_id, { reply_markup: mediaActionKeyboard(id) });
        await botInstance!.answerCallbackQuery(query.id);
      } catch {
        await botInstance!.answerCallbackQuery(query.id, { text: "❌ File not found or access denied." });
      }
    } else if (action === "delete") {
      try {
        await svc.deleteMediaByBot(id, username);
        await botInstance!.answerCallbackQuery(query.id, { text: `🗑️ ${id} deleted.` });
        if (query.message?.message_id) {
          await botInstance!.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: query.message.message_id }
          );
        }
      } catch {
        await botInstance!.answerCallbackQuery(query.id, { text: "❌ File not found or access denied." });
      }
    } else if (action === "expire") {
      const days = parseInt(parts[1]);
      if (isNaN(days)) return;
      try {
        await svc.setExpiryByBot(id, username, days);
        const label = days === 1 ? "1 day" : `${days} days`;
        await botInstance!.answerCallbackQuery(query.id, { text: `⏱ Expires in ${label}.` });
      } catch {
        await botInstance!.answerCallbackQuery(query.id, { text: "❌ File not found or access denied." });
      }
    }
  });

  botInstance.on("polling_error", (err) => {
    LoggingUtilities.service.error("TelegramBot.polling", err.message);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getSendFunction(bot: TelegramBot, fileType: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Opts = Record<string, any>;
  switch (fileType) {
    case "photo":     return (chatId: number | string, fileId: string, opts?: Opts) => bot.sendPhoto(chatId, fileId, opts);
    case "video":     return (chatId: number | string, fileId: string, opts?: Opts) => bot.sendVideo(chatId, fileId, opts);
    case "audio":     return (chatId: number | string, fileId: string, opts?: Opts) => bot.sendAudio(chatId, fileId, opts);
    case "voice":     return (chatId: number | string, fileId: string, opts?: Opts) => bot.sendVoice(chatId, fileId, opts);
    case "animation": return (chatId: number | string, fileId: string, opts?: Opts) => bot.sendAnimation(chatId, fileId, opts);
    default:          return (chatId: number | string, fileId: string, opts?: Opts) => bot.sendDocument(chatId, fileId, opts);
  }
}

function mediaActionKeyboard(id: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🗑️ Delete", callback_data: `delete:${id}` },
      ],
      [
        { text: "⏱ 1D",  callback_data: `expire:1:${id}` },
        { text: "⏱ 7D",  callback_data: `expire:7:${id}` },
        { text: "⏱ 30D", callback_data: `expire:30:${id}` },
      ],
    ],
  };
}
