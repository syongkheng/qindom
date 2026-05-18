import { Request } from "express";
import { Exceptions } from "../exceptions/AppExceptions";

export class ScenicValidator {
  static validateChecklistUpsert(req: Request): { scenicId: number; visited: boolean } {
    const { scenicId, visited } = req.body;
    if (typeof scenicId !== "number" || typeof visited !== "boolean") {
      throw new Exceptions.InvalidRequest("scenicId or visited");
    }
    return { scenicId, visited };
  }
}
