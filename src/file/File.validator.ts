import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";

export class FileValidator {
  static validateDeleteRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { fileIds: string[] } {
    const { _fileIdsToDelete } = body;
    V.required(_fileIdsToDelete, "_fileIdsToDelete", loggingEvent);
    if (!Array.isArray(_fileIdsToDelete) || _fileIdsToDelete.length === 0) {
      loggingEvent?.children?.push(`'_fileIdsToDelete' nonEmptyArray ${LogEmoji.error} `);
      throw new InvalidRequestException("_fileIdsToDelete", "format");
    }
    loggingEvent?.children?.push(`'_fileIdsToDelete' nonEmptyArray ${LogEmoji.success} `);
    return { fileIds: _fileIdsToDelete as string[] };
  }
}
