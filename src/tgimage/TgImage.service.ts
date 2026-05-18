import axios from "axios";
import crypto from "crypto";
import sharp from "sharp";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { Exceptions } from "../exceptions/AppExceptions";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";

const TABLE = "tb_tg_image";
const TABLE_WHITELIST = "tb_tg_stats_whitelist";

interface ITbTgImage {
  id?: number;
  short_code: string;
  uuid?: string;
  telegram_file_id: string;
  mime_type?: string;
  file_name?: string;
  size_in_bytes?: number;
  created_dt: number;
  record_status: string;
}

interface ITbTgStatsWhitelist {
  id?: number;
  telegram_user_id: number;
  telegram_chat_id?: number | null;
  added_dt: number;
  record_status: string;
}

export class TgImageService {
  private readonly botToken: string;


  constructor(private db: KnexSqlUtilities) {
    this.botToken = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN!;
  }

  async getStorageChatId(): Promise<number | null> {
    const rows = await this.db.raw<{ telegram_chat_id: number }[]>(
      `SELECT telegram_chat_id FROM ${TABLE_WHITELIST} WHERE record_status = 'A' AND telegram_chat_id IS NOT NULL LIMIT 1`
    );
    return rows[0]?.telegram_chat_id ?? null;
  }

  async storeAdminChatId(telegramUserId: number, chatId: number): Promise<void> {
    await this.db.update<ITbTgStatsWhitelist>(
      TABLE_WHITELIST,
      { telegram_user_id: telegramUserId, record_status: "A" } as Partial<ITbTgStatsWhitelist>,
      { telegram_chat_id: chatId },
    );
  }

  async upload(
    fileBuffer: Buffer,
    originalname: string,
    mimetype: string,
    size: number,
    meta?: { username?: string; ip?: string; sessionId?: string; uuid?: string },
  ): Promise<{ shortCode: string; url: string }> {
    const storageChatId = await this.getStorageChatId();
    if (!storageChatId) {
      throw new Exceptions.InvalidRequest("No storage chat configured. Open the CDN bot in Telegram and send /start to activate uploads.");
    }

    const captionParts = ["📤 agenda_upload"];
    if (meta?.username) captionParts.push(`👤 ${meta.username}`);
    if (meta?.ip) captionParts.push(`🌐 ${meta.ip}`);
    if (meta?.sessionId) captionParts.push(`📋 ${meta.sessionId}`);

    const formData = new FormData();
    formData.append("chat_id", String(storageChatId));
    formData.append("caption", captionParts.join("\n"));
    formData.append(
      "document",
      new Blob([new Uint8Array(fileBuffer)], { type: mimetype }),
      originalname,
    );

    const tgRes = await fetch(`https://api.telegram.org/bot${this.botToken}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const body = await tgRes.json() as {
      ok: boolean;
      result?: { document?: { file_id: string } };
    };

    if (!body.ok || !body.result?.document?.file_id) {
      LoggingUtilities.service.error("TgImageService.upload", JSON.stringify(body));
      throw new Exceptions.ExternalRequest("Telegram");
    }

    const shortCode = crypto.randomBytes(4).toString("hex");

    await this.db.insert<ITbTgImage>(TABLE, {
      short_code: shortCode,
      uuid: meta?.uuid,
      telegram_file_id: body.result.document.file_id,
      mime_type: mimetype,
      file_name: originalname,
      size_in_bytes: size,
      created_dt: Date.now(),
      record_status: "A",
    });

    return { shortCode, url: `/api/img/${shortCode}` };
  }

  async getByShortCode(shortCode: string): Promise<Pick<ITbTgImage, "telegram_file_id" | "mime_type"> | undefined> {
    return this.db.findOne<ITbTgImage>(TABLE, { short_code: shortCode, record_status: "A" }, [
      "telegram_file_id",
      "mime_type",
    ]);
  }

  async resolveStream(telegramFileId: string, mimeType: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    const fileInfo = await axios.get(
      `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${telegramFileId}`,
    );

    if (!fileInfo.data?.ok || !fileInfo.data?.result?.file_path) {
      LoggingUtilities.service.error("TgImageService.resolveStream", "Telegram getFile failed");
      throw new Exceptions.ExternalRequest("Telegram");
    }

    const filePath: string = fileInfo.data.result.file_path;
    const fileResponse = await axios.get(
      `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
      { responseType: "stream" },
    );

    if (mimeType === "image/svg+xml") {
      return { stream: fileResponse.data, contentType: "image/svg+xml" };
    }
    return { stream: fileResponse.data.pipe(sharp().jpeg({ quality: 80 })), contentType: "image/jpeg" };
  }

  async listAdmins(): Promise<{ id: number; telegram_user_id: number; added_dt: number }[]> {
    return this.db.raw<{ id: number; telegram_user_id: number; added_dt: number }[]>(
      `SELECT id, telegram_user_id, added_dt FROM ${TABLE_WHITELIST} WHERE record_status = 'A' ORDER BY added_dt DESC`
    );
  }

  async listRecent(limit: number): Promise<{ short_code: string; file_name: string | null; mime_type: string | null; size_in_bytes: number | null; created_dt: number }[]> {
    return this.db.raw<{ short_code: string; file_name: string | null; mime_type: string | null; size_in_bytes: number | null; created_dt: number }[]>(
      `SELECT short_code, file_name, mime_type, size_in_bytes, created_dt FROM ${TABLE} WHERE record_status = 'A' ORDER BY id DESC LIMIT ?`,
      [limit]
    );
  }

  async getStats(): Promise<{ totalFiles: number; totalSizeBytes: number }> {
    const rows = await this.db.raw<{ count: string; total: string }[]>(
      `SELECT COUNT(*) as count, COALESCE(SUM(size_in_bytes), 0) as total FROM ${TABLE} WHERE record_status = 'A'`
    );
    const row = rows[0];
    return { totalFiles: Number(row.count), totalSizeBytes: Number(row.total) };
  }

  async isWhitelisted(telegramUserId: number): Promise<boolean> {
    const row = await this.db.findOne<ITbTgStatsWhitelist>(
      TABLE_WHITELIST,
      { telegram_user_id: telegramUserId, record_status: "A" } as Partial<ITbTgStatsWhitelist>,
      ["id"],
    );
    return !!row;
  }

  async addToWhitelist(telegramUserId: number): Promise<void> {
    const existing = await this.db.findOne<ITbTgStatsWhitelist>(
      TABLE_WHITELIST,
      { telegram_user_id: telegramUserId } as Partial<ITbTgStatsWhitelist>,
      ["id", "record_status"],
    );
    if (existing) {
      if (existing.record_status === "A") return;
      await this.db.update<ITbTgStatsWhitelist>(TABLE_WHITELIST, { telegram_user_id: telegramUserId }, { record_status: "A" });
    } else {
      await this.db.insert<ITbTgStatsWhitelist>(TABLE_WHITELIST, {
        telegram_user_id: telegramUserId,
        added_dt: Date.now(),
        record_status: "A",
      });
    }
  }

  async removeFromWhitelist(telegramUserId: number): Promise<boolean> {
    const existing = await this.db.findOne<ITbTgStatsWhitelist>(
      TABLE_WHITELIST,
      { telegram_user_id: telegramUserId, record_status: "A" } as Partial<ITbTgStatsWhitelist>,
      ["id"],
    );
    if (!existing) return false;
    await this.db.update<ITbTgStatsWhitelist>(TABLE_WHITELIST, { telegram_user_id: telegramUserId }, { record_status: "I" });
    return true;
  }
}
