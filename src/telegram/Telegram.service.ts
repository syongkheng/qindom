import axios from "axios";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { Exceptions } from "../exceptions/AppExceptions";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { generateUniqueSlug, generateLinkToken, extractMedia, type MediaType } from "./Telegram.utils";

const TB_TELEGRAM_MEDIA      = "tb_telegram_media";
const TB_TELEGRAM_LINK       = "tb_telegram_link";
const TB_TELEGRAM_LINK_TOKEN = "tb_telegram_link_token";
const LINK_TOKEN_TTL_MS      = 10 * 60 * 1000; // 10 minutes

// ─── DB Row interfaces ───────────────────────────────────────────────────────

interface ITbTelegramMedia {
  id:               string;
  telegram_file_id: string;
  file_type:        MediaType;
  file_name:        string | null;
  file_size:        number | null;
  owner_username:   string;
  telegram_user_id: number;
  created_dt:       number;
  expires_dt:       number | null;
  record_status:    string;
}

interface ITbTelegramLink {
  telegram_user_id:  number;
  username:          string;
  telegram_username: string | null;
  dm_chat_id:        number | null;
  linked_dt:         number;
  record_status:     string;
}

interface ITbTelegramLinkToken {
  token:      string;
  username:   string;
  created_dt: number;
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface MediaDto {
  id:        string;
  fileType:  MediaType;
  fileName:  string | null;
  fileSize:  number | null;
  createdAt: number;
  expiresAt: number | null;
}

export interface LinkTokenDto {
  token:            string;
  expiresInSeconds: number;
}

export interface MediaUrlDto {
  url:       string;
  fileType:  MediaType;
  fileName:  string | null;
  expiresAt: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class TelegramService {
  private readonly botToken: string;

  constructor(private db: KnexSqlUtilities) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN!;
  }

  // ─── Mappers ─────────────────────────────────────────────────────────────

  private mapMedia(row: ITbTelegramMedia): MediaDto {
    return {
      id:        row.id,
      fileType:  row.file_type,
      fileName:  row.file_name ?? null,
      fileSize:  row.file_size ?? null,
      createdAt: row.created_dt,
      expiresAt: row.expires_dt ?? null,
    };
  }

  // ─── Link Token ──────────────────────────────────────────────────────────

  async generateLinkToken(username: string): Promise<LinkTokenDto> {
    // Delete any existing token for this user
    await this.db.raw(`DELETE FROM ${TB_TELEGRAM_LINK_TOKEN} WHERE username = ?`, [username]);

    const token = generateLinkToken();
    await this.db.raw(
      `INSERT INTO ${TB_TELEGRAM_LINK_TOKEN} (token, username, created_dt) VALUES (?, ?, ?)`,
      [token, username, Date.now()]
    );

    return { token, expiresInSeconds: LINK_TOKEN_TTL_MS / 1000 };
  }

  // ─── Bot: Link Account ───────────────────────────────────────────────────

  async linkAccount(
    telegramUserId: number,
    telegramUsername: string | undefined,
    token: string,
    dmChatId?: number
  ): Promise<string> {
    const row = await this.db.findOne<ITbTelegramLinkToken>(
      TB_TELEGRAM_LINK_TOKEN,
      { token },
      ["token", "username", "created_dt"]
    );

    if (!row) throw new Exceptions.NotFound();

    const ageMs = Date.now() - row.created_dt;
    if (ageMs > LINK_TOKEN_TTL_MS) {
      await this.db.raw(`DELETE FROM ${TB_TELEGRAM_LINK_TOKEN} WHERE token = ?`, [token]);
      throw new Exceptions.VerifyCodeExpired();
    }

    // Upsert the link (allow re-linking); only update dm_chat_id if provided
    await this.db.raw(
      `INSERT INTO ${TB_TELEGRAM_LINK} (telegram_user_id, username, telegram_username, dm_chat_id, linked_dt, record_status)
       VALUES (?, ?, ?, ?, ?, 'A')
       ON DUPLICATE KEY UPDATE
         username          = VALUES(username),
         telegram_username = VALUES(telegram_username),
         dm_chat_id        = COALESCE(VALUES(dm_chat_id), dm_chat_id),
         linked_dt         = VALUES(linked_dt),
         record_status     = 'A'`,
      [telegramUserId, row.username, telegramUsername ?? null, dmChatId ?? null, Date.now()]
    );

    // Delete used token
    await this.db.raw(`DELETE FROM ${TB_TELEGRAM_LINK_TOKEN} WHERE token = ?`, [token]);

    return row.username;
  }

  // ─── API: Link Status ─────────────────────────────────────────────────────

  async getLinkStatus(username: string): Promise<{ linked: boolean; telegramUsername: string | null }> {
    const row = await this.db.findOne<ITbTelegramLink>(
      TB_TELEGRAM_LINK,
      { username, record_status: "A" },
      ["telegram_username"]
    );
    return { linked: !!row, telegramUsername: row?.telegram_username ?? null };
  }

  // ─── Bot: Get Linked Username ─────────────────────────────────────────────

  async getLinkedUsername(telegramUserId: number): Promise<string | null> {
    const row = await this.db.findOne<ITbTelegramLink>(
      TB_TELEGRAM_LINK,
      { telegram_user_id: telegramUserId, record_status: "A" },
      ["username"]
    );
    return row?.username ?? null;
  }

  // ─── Store Media (called by bot) ──────────────────────────────────────────

  async storeMedia(params: {
    telegramUserId: number;
    ownerUsername:  string;
    fileId:         string;
    fileType:       MediaType;
    fileName?:      string;
    fileSize?:      number;
  }): Promise<string> {
    const id = await generateUniqueSlug(this.db);

    await this.db.raw(
      `INSERT INTO ${TB_TELEGRAM_MEDIA}
       (id, telegram_file_id, file_type, file_name, file_size, owner_username, telegram_user_id, created_dt, expires_dt, record_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'A')`,
      [id, params.fileId, params.fileType, params.fileName ?? null, params.fileSize ?? null, params.ownerUsername, params.telegramUserId, Date.now()]
    );

    return id;
  }

  // ─── Bot: Retrieve Media ──────────────────────────────────────────────────

  async getMediaForBot(id: string, requesterUsername: string): Promise<ITbTelegramMedia> {
    const row = await this.db.findOne<ITbTelegramMedia>(
      TB_TELEGRAM_MEDIA,
      { id, record_status: "A" },
      ["id", "telegram_file_id", "file_type", "file_name", "owner_username", "expires_dt"]
    );

    if (!row) throw new Exceptions.NotFound();
    if (row.owner_username !== requesterUsername) throw new Exceptions.ForbiddenAccess();
    if (row.expires_dt !== null && row.expires_dt < Date.now()) throw new Exceptions.NotFound();

    return row;
  }

  // ─── API: List My Media ───────────────────────────────────────────────────

  async listMedia(username: string): Promise<MediaDto[]> {
    const rows = await this.db.find<ITbTelegramMedia>(
      TB_TELEGRAM_MEDIA,
      { owner_username: username, record_status: "A" },
      { orderBy: "created_dt", orderDirection: "desc" }
    );
    return rows.map((r) => this.mapMedia(r));
  }

  // ─── API: Get Media Metadata ──────────────────────────────────────────────

  async getMedia(id: string, username: string): Promise<MediaDto> {
    const row = await this.db.findOne<ITbTelegramMedia>(
      TB_TELEGRAM_MEDIA,
      { id, owner_username: username, record_status: "A" },
      ["id", "file_type", "file_name", "file_size", "created_dt", "expires_dt"]
    );
    if (!row) throw new Exceptions.NotFound();
    return this.mapMedia(row);
  }

  // ─── API: Proxy Download ─────────────────────────────────────────────────
  // Fetches the file from Telegram internally and returns a stream.
  // The Telegram CDN URL and bot token are never sent to the client.

  async proxyDownload(id: string, username: string): Promise<{
    stream: import("stream").Readable;
    contentType: string;
    filename: string;
    contentLength: string | undefined;
  }> {
    const row = await this.db.findOne<ITbTelegramMedia>(
      TB_TELEGRAM_MEDIA,
      { id, owner_username: username, record_status: "A" },
      ["telegram_file_id", "file_type", "file_name", "expires_dt"]
    );

    if (!row) throw new Exceptions.NotFound();
    if (row.owner_username !== undefined && row.owner_username !== username) throw new Exceptions.ForbiddenAccess();
    if (row.expires_dt !== null && row.expires_dt < Date.now()) throw new Exceptions.NotFound();

    const tgResponse = await axios.get(
      `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${row.telegram_file_id}`
    );

    if (!tgResponse.data?.ok || !tgResponse.data?.result?.file_path) {
      LoggingUtilities.service.error("TelegramService.proxyDownload", "Telegram getFile failed");
      throw new Exceptions.ExternalRequest("Telegram");
    }

    const filePath: string = tgResponse.data.result.file_path;
    const fileResponse = await axios.get(
      `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
      { responseType: "stream" }
    );

    const ext = filePath.split(".").pop() ?? "";
    const filename = row.file_name ?? `${id}${ext ? "." + ext : ""}`;
    const contentType = (fileResponse.headers["content-type"] as string | undefined) ?? "application/octet-stream";
    const contentLength = fileResponse.headers["content-length"] as string | undefined;

    return { stream: fileResponse.data, contentType, filename, contentLength };
  }

  // ─── API: Soft Delete ─────────────────────────────────────────────────────

  async deleteMedia(id: string, username: string): Promise<void> {
    const row = await this.db.findOne<ITbTelegramMedia>(
      TB_TELEGRAM_MEDIA,
      { id, owner_username: username, record_status: "A" },
      ["id"]
    );
    if (!row) throw new Exceptions.NotFound();

    await this.db.update<ITbTelegramMedia>(TB_TELEGRAM_MEDIA, { id } as Partial<ITbTelegramMedia>, { record_status: "D" });
  }

  // ─── API: Set Expiry ──────────────────────────────────────────────────────

  async setExpiry(id: string, username: string, days: number): Promise<void> {
    const row = await this.db.findOne<ITbTelegramMedia>(
      TB_TELEGRAM_MEDIA,
      { id, owner_username: username, record_status: "A" },
      ["id"]
    );
    if (!row) throw new Exceptions.NotFound();

    const expires_dt = days === 0 ? null : Date.now() + days * 24 * 60 * 60 * 1000;
    await this.db.update<ITbTelegramMedia>(TB_TELEGRAM_MEDIA, { id } as Partial<ITbTelegramMedia>, { expires_dt });
  }

  // ─── Bot: List Recent Uploads ─────────────────────────────────────────────

  async listRecentMedia(username: string, page = 0, limit = 10): Promise<{ items: MediaDto[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.db.find<ITbTelegramMedia>(
        TB_TELEGRAM_MEDIA,
        { owner_username: username, record_status: "A" },
        { limit, offset: page * limit, orderBy: "created_dt", orderDirection: "desc" }
      ),
      this.db.count<ITbTelegramMedia>(TB_TELEGRAM_MEDIA, { owner_username: username, record_status: "A" }),
    ]);
    return { items: rows.map((r) => this.mapMedia(r)), total };
  }

  // ─── Bot: Delete by ID ────────────────────────────────────────────────────

  async deleteMediaByBot(id: string, username: string): Promise<void> {
    return this.deleteMedia(id, username);
  }

  // ─── Bot: Set Expiry ──────────────────────────────────────────────────────

  async setExpiryByBot(id: string, username: string, days: number): Promise<void> {
    return this.setExpiry(id, username, days);
  }

  // ─── Bot: Record DM chat (called on /start in private chat) ─────────────────

  async setDmChatId(telegramUserId: number, dmChatId: number): Promise<void> {
    await this.db.raw(
      `UPDATE ${TB_TELEGRAM_LINK} SET dm_chat_id = ? WHERE telegram_user_id = ? AND record_status = 'A'`,
      [dmChatId, telegramUserId]
    );
  }

  // ─── API: Direct Upload (sendDocument — no compression) ───────────────────

  async uploadMedia(params: {
    username:     string;
    fileBuffer:   Buffer;
    originalname: string;
    mimetype:     string;
    size:         number;
  }): Promise<MediaDto> {
    const link = await this.db.findOne<ITbTelegramLink>(
      TB_TELEGRAM_LINK,
      { username: params.username, record_status: "A" },
      ["telegram_user_id", "dm_chat_id"]
    );
    if (!link) throw new Exceptions.ForbiddenAccess();
    if (!link.dm_chat_id) throw new Exceptions.InvalidRequest("dm_chat_id");

    const formData = new FormData();
    formData.append("chat_id", String(link.dm_chat_id));
    formData.append(
      "document",
      new Blob([new Uint8Array(params.fileBuffer)], { type: params.mimetype }),
      params.originalname
    );

    const tgRes = await fetch(`https://api.telegram.org/bot${this.botToken}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const body = await tgRes.json() as {
      ok: boolean;
      result?: { document?: { file_id: string; file_name?: string; file_size?: number } };
    };

    if (!body.ok || !body.result?.document) {
      LoggingUtilities.service.error("TelegramService.uploadMedia", JSON.stringify(body));
      throw new Exceptions.ExternalRequest("Telegram");
    }

    const doc = body.result.document;
    const id = await generateUniqueSlug(this.db);
    const now = Date.now();

    await this.db.raw(
      `INSERT INTO ${TB_TELEGRAM_MEDIA}
       (id, telegram_file_id, file_type, file_name, file_size, owner_username, telegram_user_id, created_dt, expires_dt, record_status)
       VALUES (?, ?, 'document', ?, ?, ?, ?, ?, NULL, 'A')`,
      [id, doc.file_id, doc.file_name ?? params.originalname, doc.file_size ?? params.size, params.username, link.telegram_user_id, now]
    );

    return {
      id,
      fileType:  "document",
      fileName:  doc.file_name ?? params.originalname,
      fileSize:  doc.file_size ?? params.size,
      createdAt: now,
      expiresAt: null,
    };
  }
}
