import { Request } from "express";
import { Exceptions } from "../exceptions/AppExceptions";

export class TelegramValidator {
  static validateSetExpiry(req: Request): { days: number } {
    const { days } = req.body;
    if (days === undefined || typeof days !== "number" || !Number.isInteger(days) || days < 0) {
      throw new Exceptions.InvalidRequest();
    }
    return { days };
  }

  static validateIdParam(req: Request): { id: string } {
    const { id } = req.params;
    if (!id || typeof id !== "string" || id.trim().length === 0) {
      throw new Exceptions.InvalidRequest();
    }
    return { id: id.trim() };
  }
}
