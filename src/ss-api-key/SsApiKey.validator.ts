import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

// name VARCHAR(100) on tb_ss_api_key.
const NAME_MAX_LENGTH = 100;

export class SsApiKeyValidator {
  static validateRenameRequest(body: Record<string, unknown>, loggingEvent?: IRequestLogEvent): { name: string } {
    const { name } = body as any;
    V.string(name, "name", loggingEvent);

    const trimmed = (name as string).trim();
    if (!trimmed) throw new Exceptions.InvalidRequest("name", "mandatory");
    if (trimmed.length > NAME_MAX_LENGTH) throw new Exceptions.InvalidRequest("name", "format");

    return { name: trimmed };
  }
}
