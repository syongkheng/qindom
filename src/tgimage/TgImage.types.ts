/**
 * `tb_tg_stats_whitelist.record_status` for a removed admin. `removeFromWhitelist` has always stored
 * "I" (not `RecordStatus.DELETED`); `addToWhitelist` reactivates any non-active row, and every read
 * filters on `RecordStatus.ACTIVE`.
 */
export const WHITELIST_REMOVED_STATUS = "I";
export type WhitelistRemovedStatus = typeof WHITELIST_REMOVED_STATUS;

// ── POST /img/upload ──

/** The multipart `file` part, checked against the `tb_tg_image` column widths. */
export interface TgImageFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

/** Optional multipart text fields sent next to the file. */
export interface TgImageUploadBody {
  /** Itinerary session the upload belongs to; only shown in the Telegram caption. */
  sessionId: string | null;
  /** Client-generated id of the itinerary file row; stored in `tb_tg_image.uuid` (unique). */
  uuid: string | null;
}

/** Who uploaded, for the Telegram caption. */
export interface TgImageUploader {
  username: string;
  ip: string;
}

export interface TgImageUploadDto {
  shortCode: string;
  /** Path on the API origin, e.g. `/img/1a2b3c4d`. */
  url: string;
}

// ── GET /img/:shortCode ──

/** Re-encoded image bytes, fully buffered so a failure never happens mid-response. */
export interface TgImageContent {
  body: Buffer;
  contentType: string;
}

// ── Bot commands (/stats, /list) ──

export interface TgImageSummaryDto {
  shortCode: string;
  fileName: string | null;
  mimeType: string | null;
  sizeInBytes: number | null;
  createdAt: number;
}

export interface TgImageStatsDto {
  totalFiles: number;
  totalSizeBytes: number;
}

// ── /img/admin/* (tb_tg_stats_whitelist) ──

export interface TgAdminDto {
  id: number;
  telegramUserId: number;
  addedAt: number;
}

export interface TgAdminBody {
  telegramUserId: number;
}

export interface TgAdminAddedDto {
  added: true;
}

export interface TgAdminRemovedDto {
  /** false when the user wasn't an active admin. */
  removed: boolean;
}
