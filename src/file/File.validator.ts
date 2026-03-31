import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]);

export class FileValidator {
  static validateUploadRequest(req: Request): {
    uuid: string; agendaId: number; blob: string;
    mimeType: string; name?: string | null; sizeInBytes?: number | null;
  } {
    const { uuid, agendaId, name, mimeType, sizeInBytes, blob } = req.body;
    if (!uuid) throw new InvalidRequestException("uuid");
    if (!agendaId) throw new InvalidRequestException("agendaId");
    if (!blob) throw new InvalidRequestException("blob");
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) throw new InvalidRequestException("mimeType");
    return { uuid, agendaId: Number(agendaId), blob, mimeType, name: name ?? null, sizeInBytes: sizeInBytes ?? null };
  }

  static validateDeleteRequest(req: Request): { fileIds: string[] } {
    const { _fileIdsToDelete } = req.body;
    if (!Array.isArray(_fileIdsToDelete) || _fileIdsToDelete.length === 0) {
      throw new InvalidRequestException("_fileIdsToDelete");
    }
    return { fileIds: _fileIdsToDelete };
  }
}
