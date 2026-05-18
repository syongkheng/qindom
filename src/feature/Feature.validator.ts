import { Request } from "express";
import { Exceptions } from "../exceptions/AppExceptions";

export class FeatureValidator {
  static validateCreateRequest(req: Request): { key: string; label: string; remarks: string | null } {
    const { key, label, remarks } = req.body;
    if (!key || typeof key !== "string" || !key.trim()) throw new Exceptions.InvalidRequest("key");
    if (!label || typeof label !== "string" || !label.trim()) throw new Exceptions.InvalidRequest("label");
    return { key: key.trim(), label: label.trim(), remarks: remarks || null };
  }
}
