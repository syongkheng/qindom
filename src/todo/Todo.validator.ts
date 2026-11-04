import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

export const TODO_MAX_TITLE = 500;
const MAX_REORDER_IDS = 1000;

export interface UpdateTodoBody {
  title?: string;
  done?: boolean;
  pinned?: boolean;
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > TODO_MAX_TITLE) throw new Exceptions.InvalidRequest("title", "format");
  return trimmed;
}

export class TodoValidator {
  static validateCreateRequest(body: Record<string, unknown>, loggingEvent?: IRequestLogEvent): { title: string } {
    const { title } = body as any;
    V.requiredString(title, "title", loggingEvent);
    return { title: cleanTitle(title) };
  }

  static validateUpdateRequest(body: Record<string, unknown>, loggingEvent?: IRequestLogEvent): UpdateTodoBody {
    const { title, done, pinned } = body as any;
    const out: UpdateTodoBody = {};
    if (title !== undefined) {
      V.requiredString(title, "title", loggingEvent);
      out.title = cleanTitle(title);
    }
    if (done !== undefined) {
      V.requiredBoolean(done, "done", loggingEvent);
      out.done = done;
    }
    if (pinned !== undefined) {
      V.requiredBoolean(pinned, "pinned", loggingEvent);
      out.pinned = pinned;
    }
    if (Object.keys(out).length === 0) throw new Exceptions.InvalidRequest("body", "mandatory");
    return out;
  }

  static validateReorderRequest(body: Record<string, unknown>): { ids: string[] } {
    const { ids } = body as any;
    if (!Array.isArray(ids) || ids.length > MAX_REORDER_IDS || !ids.every((i) => typeof i === "string" && i.length <= 36)) {
      throw new Exceptions.InvalidRequest("ids", "format");
    }
    return { ids };
  }
}
