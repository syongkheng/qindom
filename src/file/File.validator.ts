import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { FileDeleteBody } from "./File.types.js";

const FILE_IDS_FIELD = "_fileIdsToDelete";
// Bounds the SQL IN (...) list; one save only deletes the files removed from a single agenda item.
const MAX_FILES_PER_DELETE = 100;

export function validateDeleteBody(body: Record<string, unknown>, event?: IRequestLogEvent): FileDeleteBody {
  const fileIds = body[FILE_IDS_FIELD];
  V.required(fileIds, FILE_IDS_FIELD, event);

  const isValid =
    Array.isArray(fileIds) &&
    fileIds.length > 0 &&
    fileIds.length <= MAX_FILES_PER_DELETE &&
    fileIds.every((id) => typeof id === "string" && id.length > 0);
  event?.children?.push(
    `'${FILE_IDS_FIELD}' 1–${MAX_FILES_PER_DELETE} uuids ${isValid ? LogEmoji.success : LogEmoji.error} `,
  );
  if (!isValid) throw new Exceptions.InvalidRequest(FILE_IDS_FIELD, "format");

  return { _fileIdsToDelete: fileIds as string[] };
}
