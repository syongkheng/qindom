import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V, charLength } from "../utils/StructuralValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { TodoCreateBody, TodoReorderBody, TodoUpdateBody } from "./Todo.types.js";

// tb_todo_task.title is VARCHAR(500).
const TITLE_MAX_LENGTH = 500;
const MAX_REORDER_IDS = 1000;
const UUID_MAX_LENGTH = 36;

const cleanTitle = (title: unknown, event?: IRequestLogEvent): string =>
  V.requiredText(title, "title", TITLE_MAX_LENGTH, event);

export function validateCreateBody(body: Record<string, unknown>, event?: IRequestLogEvent): TodoCreateBody {
  return { title: cleanTitle(body.title, event) };
}

export function validateUpdateBody(body: Record<string, unknown>, event?: IRequestLogEvent): TodoUpdateBody {
  const update: TodoUpdateBody = {};
  if (body.title !== undefined) update.title = cleanTitle(body.title, event);
  if (body.done !== undefined) {
    V.requiredBoolean(body.done, "done", event);
    update.done = body.done as boolean;
  }
  if (body.pinned !== undefined) {
    V.requiredBoolean(body.pinned, "pinned", event);
    update.pinned = body.pinned as boolean;
  }
  if (Object.keys(update).length === 0) throw new Exceptions.InvalidRequest("body", "mandatory");
  return update;
}

export function validateReorderBody(body: Record<string, unknown>, event?: IRequestLogEvent): TodoReorderBody {
  const { ids } = body;
  const isValid =
    Array.isArray(ids) &&
    ids.length <= MAX_REORDER_IDS &&
    ids.every((id) => typeof id === "string" && charLength(id) <= UUID_MAX_LENGTH);
  event?.children?.push(`'ids' ≤${MAX_REORDER_IDS} uuids ${isValid ? LogEmoji.success : LogEmoji.error} `);
  if (!isValid) throw new Exceptions.InvalidRequest("ids", "format");
  return { ids: ids as string[] };
}
