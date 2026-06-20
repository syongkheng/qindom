import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

export class FileValidator {
  static validateDeleteRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { fileIds: string[] } {
    const { _fileIdsToDelete } = body;
    StructuralValidationUtilities.required(_fileIdsToDelete, "_fileIdsToDelete", event);
    if (!Array.isArray(_fileIdsToDelete) || _fileIdsToDelete.length === 0) {
      event?.children?.push(`'_fileIdsToDelete' nonEmptyArray ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'_fileIdsToDelete' must be a non-empty array");
    }
    event?.children?.push(`'_fileIdsToDelete' nonEmptyArray ${LogEmoji.success} `);
    return { fileIds: _fileIdsToDelete as string[] };
  }
}
