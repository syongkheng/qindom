import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";

export class FileValidator {
  static validateDeleteRequest(req: Request): { fileIds: string[] } {
    const { _fileIdsToDelete } = req.body;
    if (!Array.isArray(_fileIdsToDelete) || _fileIdsToDelete.length === 0) {
      throw new InvalidRequestException("_fileIdsToDelete");
    }
    return { fileIds: _fileIdsToDelete };
  }
}
