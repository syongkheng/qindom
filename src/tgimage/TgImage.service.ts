import axios from "axios";
import crypto from "crypto";
import sharp from "sharp";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/errorUtils.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITbTgImage } from "../models/databases/tb_tg_image.js";
import { ITbTgStatsWhitelist } from "../models/databases/tb_tg_stats_whitelist.js";
import {
  TgAdminDto,
  TgImageFile,
  TgImageStatsDto,
  TgImageContent,
  TgImageSummaryDto,
  TgImageUploadBody,
  TgImageUploadDto,
  TgImageUploader,
} from "./TgImage.types.js";

const TG_IMAGE_TABLE = "tb_tg_image";
const TG_STATS_WHITELIST_TABLE = "tb_tg_stats_whitelist";

/**
 * `removeFromWhitelist` has always stored "I" (not `RecordStatus.DELETED`); `addToWhitelist`
 * reactivates any non-active row, and every read filters on `RecordStatus.ACTIVE`.
 */
const WHITELIST_REMOVED_STATUS = "I";

const TELEGRAM_SERVICE_NAME = "Telegram";
const TELEGRAM_API_URL = "https://api.telegram.org";
const BOT_TOKEN_ENV = "AWENSE_CDN_TELEGRAM_BOT_TOKEN";

const MB = 1024 * 1024;
/**
 * Telegram's getFile/download endpoint hard-caps at 20MB regardless of the ~50MB
 * sendDocument upload limit: anything stored bigger can never be retrieved again,
 * so we compress before upload to stay under it.
 */
const MAX_TELEGRAM_FILE_BYTES = 19 * MB;
/** Telegram's own download cap; anything larger is refused rather than buffered. */
const MAX_TELEGRAM_DOWNLOAD_BYTES = 20 * MB;
const COMPRESS_MAX_ATTEMPTS = 8;
const COMPRESS_START_QUALITY = 80;
const COMPRESS_QUALITY_STEP = 10;
/** Below this quality, shrink the width instead of lowering quality further. */
const COMPRESS_MIN_QUALITY = 40;
const COMPRESS_RESIZE_QUALITY = 60;
const COMPRESS_RESIZE_FACTOR = 0.85;
/** Starting width when sharp can't read the image's own. */
const COMPRESS_FALLBACK_WIDTH = 4000;

/** Quality of the JPEG every non-SVG image is re-encoded to on read. */
const SERVE_JPEG_QUALITY = 80;
/** Stored when the upload row has no mime type. */
const DEFAULT_MIME_TYPE = "image/jpeg";
const SVG_MIME_TYPE = "image/svg+xml";
const PNG_MIME_TYPE = "image/png";
const JPEG_MIME_TYPE = "image/jpeg";

/** 4 random bytes = 8 hex chars (`tb_tg_image.short_code` VARCHAR(16), unique). */
const SHORT_CODE_BYTES = 4;
const UPLOAD_CAPTION_TITLE = "📤 agenda_upload";

const SUMMARY_COLUMNS = ["short_code", "file_name", "mime_type", "size_in_bytes", "created_dt"] as const;
const ADMIN_COLUMNS = ["id", "telegram_user_id", "added_dt"] as const;

type TgImageSummaryRow = Pick<ITbTgImage, (typeof SUMMARY_COLUMNS)[number]>;
type TgAdminRow = Pick<ITbTgStatsWhitelist, (typeof ADMIN_COLUMNS)[number]>;

/** Read lazily: dotenv runs in index.ts after ESM imports are evaluated. Missing token = our misconfiguration (500). */
function getBotToken(): string {
  const token = process.env[BOT_TOKEN_ENV];
  if (!token) {
    LoggingUtilities.service.error("TgImageService.getBotToken", `${BOT_TOKEN_ENV} is not set`);
    throw new Exceptions.Unknown();
  }
  return token;
}

export function toTgImageSummaryDto(row: TgImageSummaryRow): TgImageSummaryDto {
  return {
    shortCode: row.short_code,
    fileName: row.file_name ?? null,
    mimeType: row.mime_type ?? null,
    sizeInBytes: row.size_in_bytes ?? null,
    createdAt: row.created_dt,
  };
}

export function toTgAdminDto(row: TgAdminRow): TgAdminDto {
  return { id: row.id!, telegramUserId: row.telegram_user_id, addedAt: row.added_dt };
}

/** Caption shown on the stored Telegram document (one line per known detail). */
export function buildUploadCaption(uploader: TgImageUploader, sessionId: string | null): string {
  const parts = [UPLOAD_CAPTION_TITLE];
  if (uploader.username) parts.push(`👤 ${uploader.username}`);
  if (uploader.ip) parts.push(`🌐 ${uploader.ip}`);
  if (sessionId) parts.push(`📋 ${sessionId}`);
  return parts.join("\n");
}

/**
 * Owns `tb_tg_image` (the Telegram-backed image CDN) and the bot-admin writes to
 * `tb_tg_stats_whitelist`. `TelegramLogSubscriptionService` also reads the whitelist.
 */
export class TgImageService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Stores the file as a Telegram document in the storage chat and returns its short code.
   * SVG is rasterised to PNG first; anything over Telegram's retrieval cap is re-encoded as JPEG.
   */
  async upload(
    file: TgImageFile,
    body: TgImageUploadBody,
    uploader: TgImageUploader,
    logContext?: IRequestLogContext,
  ): Promise<TgImageUploadDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Upload image to Telegram");
    const token = getBotToken();
    const storageChatId = await this.getStorageChatId(event);
    if (!storageChatId) {
      // Nobody on the whitelist has sent the CDN bot /start yet (see TgImage.bot.ts).
      LoggingUtilities.service.error(
        "TgImageService.upload",
        "No storage chat configured: open the CDN bot in Telegram and send /start to activate uploads",
      );
      throw new Exceptions.Unknown();
    }

    // SVG can carry <script>, and /img is served from the API origin (where the
    // auth + CSRF cookies live), so it's rasterised here and never stored as SVG.
    const safe =
      file.mimeType === SVG_MIME_TYPE
        ? { buffer: await sharp(file.buffer).png().toBuffer(), mimetype: PNG_MIME_TYPE }
        : { buffer: file.buffer, mimetype: file.mimeType };

    const { buffer: uploadBuffer, mimetype: uploadMimetype } = await this.compressForTelegram(
      safe.buffer,
      safe.mimetype,
    );

    const formData = new FormData();
    formData.append("chat_id", String(storageChatId));
    formData.append("caption", buildUploadCaption(uploader, body.sessionId));
    formData.append("document", new Blob([new Uint8Array(uploadBuffer)], { type: uploadMimetype }), file.originalName);

    let tgBody: { ok: boolean; result?: { document?: { file_id: string } } };
    try {
      const tgRes = await fetch(`${TELEGRAM_API_URL}/bot${token}/sendDocument`, { method: "POST", body: formData });
      tgBody = (await tgRes.json()) as typeof tgBody;
    } catch (error) {
      LoggingUtilities.service.error("TgImageService.upload", `sendDocument failed: ${toMessage(error)}`);
      throw new Exceptions.ExternalRequest(TELEGRAM_SERVICE_NAME);
    }
    const telegramFileId = tgBody.result?.document?.file_id;
    if (!tgBody.ok || !telegramFileId) {
      LoggingUtilities.service.error("TgImageService.upload", JSON.stringify(tgBody));
      throw new Exceptions.ExternalRequest(TELEGRAM_SERVICE_NAME);
    }

    const shortCode = crypto.randomBytes(SHORT_CODE_BYTES).toString("hex");
    await this.db.insert<ITbTgImage>(
      TG_IMAGE_TABLE,
      {
        short_code: shortCode,
        uuid: body.uuid ?? undefined,
        telegram_file_id: telegramFileId,
        mime_type: uploadMimetype,
        file_name: file.originalName,
        size_in_bytes: uploadBuffer.length,
        created_dt: Date.now(),
        record_status: RecordStatus.ACTIVE,
      },
      event,
    );
    if (event) event.detail = `${shortCode} (${uploadBuffer.length} bytes)`;

    return { shortCode, url: `/img/${shortCode}` };
  }

  /**
   * Downloads an active image from Telegram and re-encodes it with sharp: never the raw bytes.
   * Fully buffered (Telegram caps downloads at 20MB), so every failure happens before the
   * controller writes a header: unknown short code = 404, Telegram unreachable or refusing = 502,
   * stored bytes sharp can't decode = 500 (server log).
   */
  async loadImage(shortCode: string, logContext?: IRequestLogContext): Promise<TgImageContent> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Load image from Telegram");
    const record = await this.db.findOne<ITbTgImage>(
      TG_IMAGE_TABLE,
      { short_code: shortCode, record_status: RecordStatus.ACTIVE },
      ["telegram_file_id", "mime_type"],
      event,
    );
    if (!record) throw new Exceptions.NotFound();
    const mimeType = record.mime_type ?? DEFAULT_MIME_TYPE;
    const token = getBotToken();

    let source: Buffer;
    try {
      const query = new URLSearchParams({ file_id: record.telegram_file_id });
      const fileInfo = await axios.get(`${TELEGRAM_API_URL}/bot${token}/getFile?${query}`);
      const filePath: unknown = fileInfo.data?.result?.file_path;
      if (!fileInfo.data?.ok || typeof filePath !== "string" || !filePath) throw new Error("getFile returned no path");
      const fileResponse = await axios.get<ArrayBuffer>(`${TELEGRAM_API_URL}/file/bot${token}/${filePath}`, {
        responseType: "arraybuffer",
        maxContentLength: MAX_TELEGRAM_DOWNLOAD_BYTES,
      });
      source = Buffer.from(fileResponse.data);
    } catch (error) {
      LoggingUtilities.service.error("TgImageService.loadImage", `Telegram download failed: ${toMessage(error)}`);
      throw new Exceptions.ExternalRequest(TELEGRAM_SERVICE_NAME);
    }

    try {
      // Rows stored before SVGs were rasterised at upload: never serve raw SVG.
      if (mimeType === SVG_MIME_TYPE) {
        return { body: await sharp(source).png().toBuffer(), contentType: PNG_MIME_TYPE };
      }
      // sharp() strips EXIF (including Orientation) on re-encode by default.
      // .rotate() with no args bakes the EXIF-specified rotation into the
      // pixels first, so the image still displays upright once that tag is gone.
      return {
        body: await sharp(source).rotate().jpeg({ quality: SERVE_JPEG_QUALITY }).toBuffer(),
        contentType: JPEG_MIME_TYPE,
      };
    } catch (error) {
      // A stored file that isn't a decodable image (uploads weren't restricted to image/* before).
      LoggingUtilities.service.error("TgImageService.loadImage", `Cannot re-encode ${shortCode}: ${toMessage(error)}`);
      if (event) event.detail = "undecodable stored file";
      throw new Exceptions.Unknown();
    }
  }

  /** Newest first (bot `/list`). */
  async listRecent(limit: number, logContext?: IRequestLogContext): Promise<TgImageSummaryDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List recent images");
    const rows = await this.db.find<ITbTgImage>(
      TG_IMAGE_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { orderBy: "id", orderDirection: "desc", limit, columns: SUMMARY_COLUMNS },
      event,
    );
    return rows.map(toTgImageSummaryDto);
  }

  /** File count and total stored bytes (bot `/stats`). */
  async getStats(logContext?: IRequestLogContext): Promise<TgImageStatsDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Image hosting stats");
    const rows = await this.db.raw<{ count: string; total: string }[]>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(size_in_bytes), 0) AS total FROM ${TG_IMAGE_TABLE} WHERE record_status = ?`,
      [RecordStatus.ACTIVE],
      event,
    );
    return { totalFiles: Number(rows[0].count), totalSizeBytes: Number(rows[0].total) };
  }

  // ── Bot admins (tb_tg_stats_whitelist) ──

  /** Active bot admins, most recently added first. */
  async listAdmins(logContext?: IRequestLogContext): Promise<TgAdminDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List bot admins");
    const rows = await this.db.find<ITbTgStatsWhitelist>(
      TG_STATS_WHITELIST_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { orderBy: "added_dt", orderDirection: "desc", columns: ADMIN_COLUMNS },
      event,
    );
    return rows.map(toTgAdminDto);
  }

  async isWhitelisted(telegramUserId: number, logContext?: IRequestLogContext): Promise<boolean> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Check bot admin");
    const row = await this.db.findOne<ITbTgStatsWhitelist>(
      TG_STATS_WHITELIST_TABLE,
      { telegram_user_id: telegramUserId, record_status: RecordStatus.ACTIVE },
      ["id"],
      event,
    );
    return !!row;
  }

  /** Remembers the admin's private chat with the bot (set on /start); it becomes a storage/log chat. */
  async storeAdminChatId(telegramUserId: number, chatId: number, logContext?: IRequestLogContext): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Store bot admin chat id");
    await this.db.update<ITbTgStatsWhitelist>(
      TG_STATS_WHITELIST_TABLE,
      { telegram_user_id: telegramUserId, record_status: RecordStatus.ACTIVE },
      { telegram_chat_id: chatId },
      event,
    );
  }

  /** Idempotent: an active admin is left alone, a removed one is reactivated (keeping its chat id). */
  async addToWhitelist(telegramUserId: number, logContext?: IRequestLogContext): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Add bot admin");
    const existing = await this.db.findOne<ITbTgStatsWhitelist>(
      TG_STATS_WHITELIST_TABLE,
      { telegram_user_id: telegramUserId },
      ["id", "record_status"],
      event,
    );
    if (existing?.record_status === RecordStatus.ACTIVE) {
      if (event) event.detail = "already active";
      return;
    }
    if (existing) {
      await this.db.update<ITbTgStatsWhitelist>(
        TG_STATS_WHITELIST_TABLE,
        { telegram_user_id: telegramUserId },
        { record_status: RecordStatus.ACTIVE },
        event,
      );
      if (event) event.detail = "reactivated";
      return;
    }
    await this.db.insert<ITbTgStatsWhitelist>(
      TG_STATS_WHITELIST_TABLE,
      { telegram_user_id: telegramUserId, added_dt: Date.now(), record_status: RecordStatus.ACTIVE },
      event,
    );
  }

  /** Returns false when the user wasn't an active admin. */
  async removeFromWhitelist(telegramUserId: number, logContext?: IRequestLogContext): Promise<boolean> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Remove bot admin");
    const existing = await this.db.findOne<ITbTgStatsWhitelist>(
      TG_STATS_WHITELIST_TABLE,
      { telegram_user_id: telegramUserId, record_status: RecordStatus.ACTIVE },
      ["id"],
      event,
    );
    if (!existing) return false;
    await this.db.update<ITbTgStatsWhitelist>(
      TG_STATS_WHITELIST_TABLE,
      { telegram_user_id: telegramUserId },
      { record_status: WHITELIST_REMOVED_STATUS },
      event,
    );
    return true;
  }

  /** The first active admin chat (any one: no ordering, as before) receives every uploaded document. */
  private async getStorageChatId(event?: IRequestLogEvent): Promise<number | null> {
    const rows = await this.db.find<ITbTgStatsWhitelist>(
      TG_STATS_WHITELIST_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { limit: 1, columns: ["telegram_chat_id"], extraWhere: (qb) => qb.whereNotNull("telegram_chat_id") },
      event,
    );
    return rows[0]?.telegram_chat_id ?? null;
  }

  private async compressForTelegram(buffer: Buffer, mimetype: string): Promise<{ buffer: Buffer; mimetype: string }> {
    if (buffer.length <= MAX_TELEGRAM_FILE_BYTES) {
      return { buffer, mimetype };
    }

    let quality = COMPRESS_START_QUALITY;
    let width: number | undefined;
    let output = buffer;

    for (let attempt = 0; attempt < COMPRESS_MAX_ATTEMPTS; attempt++) {
      const pipeline = sharp(buffer, { failOn: "none" }).rotate();
      if (width) pipeline.resize({ width, withoutEnlargement: true });
      output = await pipeline.jpeg({ quality }).toBuffer();

      if (output.length <= MAX_TELEGRAM_FILE_BYTES) {
        break;
      }

      if (quality > COMPRESS_MIN_QUALITY) {
        quality -= COMPRESS_QUALITY_STEP;
      } else {
        const metadata = await sharp(buffer).metadata();
        width = Math.round((width ?? metadata.width ?? COMPRESS_FALLBACK_WIDTH) * COMPRESS_RESIZE_FACTOR);
        quality = COMPRESS_RESIZE_QUALITY;
      }
    }

    LoggingUtilities.service.info(
      "TgImageService.upload",
      `Compressed image from ${buffer.length} to ${output.length} bytes to stay under Telegram's 20MB retrieval cap`,
    );
    return { buffer: output, mimetype: JPEG_MIME_TYPE };
  }
}
