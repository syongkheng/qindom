import { LogEmoji } from "../constants/LogEmoji.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { TgAdminBody, TgImageFile, TgImageUploadBody } from "./TgImage.types.js";

/** tb_tg_image.file_name VARCHAR(512) */
export const FILE_NAME_MAX_LENGTH = 512;
/** tb_tg_image.mime_type VARCHAR(128) */
export const MIME_TYPE_MAX_LENGTH = 128;
/** tb_tg_image.uuid VARCHAR(36) */
export const UUID_MAX_LENGTH = 36;
const IMAGE_MIME_PREFIX = "image/";
/** No column: only goes into the Telegram caption, which Telegram caps at 1024 chars in total. */
export const SESSION_ID_MAX_LENGTH = 256;

/** The multipart `file` part multer parsed (undefined when the request had none). */
export function validateUploadFile(file: Express.Multer.File | undefined, event?: IRequestLogEvent): TgImageFile {
  if (!file) {
    if (event) event.children?.push(`(M) 'file' required ${LogEmoji.error} `);
    throw new Exceptions.InvalidRequest("file", "mandatory");
  }
  const mimeType = V.requiredText(file.mimetype, "mimeType", MIME_TYPE_MAX_LENGTH, event);
  // Every fndom upload picker is accept="image/*", and /img only ever serves re-encoded images.
  if (!mimeType.toLowerCase().startsWith(IMAGE_MIME_PREFIX)) {
    if (event) event.children?.push(`(M) 'file' image/* ${LogEmoji.error} `);
    throw new Exceptions.InvalidRequest("file", "format");
  }
  return {
    buffer: file.buffer,
    // A blank name is stored as sent (Telegram still gets a document).
    originalName: V.optionalText(file.originalname, "fileName", FILE_NAME_MAX_LENGTH, event) ?? file.originalname,
    mimeType,
  };
}

/** The text fields of the upload form (`sessionId`, `uuid`), both optional. */
export function validateUploadBody(
  body: Record<string, unknown> | undefined,
  event?: IRequestLogEvent,
): TgImageUploadBody {
  return {
    sessionId: V.optionalText(body?.sessionId, "sessionId", SESSION_ID_MAX_LENGTH, event),
    uuid: V.optionalText(body?.uuid, "uuid", UUID_MAX_LENGTH, event),
  };
}

/** `{ telegramUserId }`: a positive integer, as a number or a numeric string. */
export function validateAdminBody(body: Record<string, unknown> | undefined, event?: IRequestLogEvent): TgAdminBody {
  V.required(body?.telegramUserId, "telegramUserId", event);
  const raw = body?.telegramUserId;
  const telegramUserId = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof telegramUserId !== "number" || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    if (event) event.children?.push(`(M) 'telegramUserId' positive integer ${LogEmoji.error} `);
    throw new Exceptions.InvalidRequest("telegramUserId", "format");
  }
  return { telegramUserId };
}
