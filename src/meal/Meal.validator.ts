import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

const VALID_MEAL_TYPES  = ["breakfast", "lunch", "dinner", "snack"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class MealValidator {
  static validateCreateRequest(req: Request): {
    logDate: string; mealType: string; plannedName: string; notes?: string | null;
  } {
    const { logDate, mealType, plannedName, notes } = req.body;
    if (!logDate) throw new InvalidRequestException("logDate");
    if (!mealType || !VALID_MEAL_TYPES.includes(mealType)) throw new InvalidRequestException("mealType");
    if (!plannedName) throw new InvalidRequestException("plannedName");
    return { logDate, mealType, plannedName, notes: notes ?? null };
  }

  static validateUpdateRequest(req: Request): {
    id: number; plannedName: string; notes?: string | null;
  } {
    const { id, plannedName, notes } = req.body;
    if (!id) throw new InvalidRequestException("id");
    if (!plannedName) throw new InvalidRequestException("plannedName");
    return { id: Number(id), plannedName, notes: notes ?? null };
  }

  static validateRangeRequest(req: Request): { from: string; to: string } {
    const from = req.query.from as string;
    const to   = req.query.to   as string;
    if (!from || !to) throw new InvalidRequestException("from/to");
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw new InvalidRequestException("date range");
    return { from, to };
  }

  static validatePhotoUploadRequest(req: Request): {
    mealLogId: number; blob: string; mimeType: string; name?: string | null; sizeInBytes?: number | null;
  } {
    const { mealLogId, name, mimeType, sizeInBytes, blob } = req.body;
    if (!mealLogId) throw new InvalidRequestException("mealLogId");
    if (!blob) throw new InvalidRequestException("blob");
    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) throw new InvalidRequestException("mimeType");
    return { mealLogId: Number(mealLogId), blob, mimeType, name: name ?? null, sizeInBytes: sizeInBytes ?? null };
  }

  static validateIdRequest(req: Request): { id: number } {
    const { id } = req.body;
    if (!id) throw new InvalidRequestException("id");
    return { id: Number(id) };
  }
}
