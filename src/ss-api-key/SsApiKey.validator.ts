import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { SsApiKeyRenameBody } from "./SsApiKey.types.js";

// tb_ss_api_key.name is VARCHAR(100).
const NAME_MAX_LENGTH = 100;

export function validateRenameBody(body: Record<string, unknown>, event?: IRequestLogEvent): SsApiKeyRenameBody {
  V.string(body.name, "name", event);
  // Blank keeps its own "mandatory" error; requiredText then trims and caps in code points.
  if (!(body.name as string).trim()) throw new Exceptions.InvalidRequest("name", "mandatory");
  return { name: V.requiredText(body.name, "name", NAME_MAX_LENGTH, event) };
}
