import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";

const TB_TELEGRAM_MEDIA = "tb_telegram_media";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateSlug(length = 6): string {
  return Array.from(crypto.randomBytes(length))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");
}

export async function generateUniqueSlug(db: KnexSqlUtilities): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateSlug();
    const existing = await db.findOne<{ id: string }>(TB_TELEGRAM_MEDIA, { id: slug }, ["id"]);
    if (!existing) return slug;
  }
  throw new Error("Failed to generate unique media slug after 3 attempts");
}

export function generateLinkToken(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // 8-char hex
}

type TelegramMessage = {
  photo?: { file_id: string; file_size?: number }[];
  video?: { file_id: string; file_size?: number; file_name?: string };
  document?: { file_id: string; file_size?: number; file_name?: string };
  audio?: { file_id: string; file_size?: number; file_name?: string };
  voice?: { file_id: string; file_size?: number };
  animation?: { file_id: string; file_size?: number; file_name?: string };
};

export type MediaType = "photo" | "video" | "document" | "audio" | "voice" | "animation";

export function extractMedia(
  msg: TelegramMessage
): { fileId: string; fileType: MediaType; fileName?: string; fileSize?: number } | null {
  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    return { fileId: largest.file_id, fileType: "photo", fileSize: largest.file_size };
  }
  if (msg.video)
    return { fileId: msg.video.file_id, fileType: "video", fileName: msg.video.file_name, fileSize: msg.video.file_size };
  if (msg.document)
    return { fileId: msg.document.file_id, fileType: "document", fileName: msg.document.file_name, fileSize: msg.document.file_size };
  if (msg.audio)
    return { fileId: msg.audio.file_id, fileType: "audio", fileName: msg.audio.file_name, fileSize: msg.audio.file_size };
  if (msg.voice)
    return { fileId: msg.voice.file_id, fileType: "voice", fileSize: msg.voice.file_size };
  if (msg.animation)
    return { fileId: msg.animation.file_id, fileType: "animation", fileName: msg.animation.file_name, fileSize: msg.animation.file_size };
  return null;
}
