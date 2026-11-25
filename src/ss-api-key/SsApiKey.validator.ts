import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { SsApiKeyRenameBody } from "./SsApiKey.types.js";

// tb_ss_api_key.name is VARCHAR(100).
const NAME_MAX_LENGTH = 100;

export function validateRenameBody(body: Record<string, unknown>, event?: IRequestLogEvent): SsApiKeyRenameBody {
  V.string(body.name, "name", event);
  const name = (body.name as string).trim();
  if (!name) throw new Exceptions.InvalidRequest("name", "mandatory");
  if (name.length > NAME_MAX_LENGTH) throw new Exceptions.InvalidRequest("name", "format");
  return { name };
}
