import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

export const LAYOUT_MAX_NAME = 100;
export const LAYOUT_MAX_BYTES = 1_000_000;
const MAX_ITEMS = 500;
const MAX_CUSTOM = 200;
const MAX_WALLS = 400;

export interface LayoutPayload {
  items: unknown[];
  custom: unknown[];
  walls?: unknown[];
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > LAYOUT_MAX_NAME) throw new Exceptions.InvalidRequest("name", "format");
  return trimmed;
}

// Only the envelope is checked here; the client re-sanitises every item and wall when it loads a layout.
function cleanData(data: unknown): { json: string; itemCount: number } {
  const d = data as any;
  if (!d || typeof d !== "object" || !Array.isArray(d.items) || d.items.length > MAX_ITEMS) throw new Exceptions.InvalidRequest("data", "format");
  if (d.custom !== undefined && (!Array.isArray(d.custom) || d.custom.length > MAX_CUSTOM)) throw new Exceptions.InvalidRequest("data", "format");
  if (d.walls !== undefined && (!Array.isArray(d.walls) || d.walls.length > MAX_WALLS)) throw new Exceptions.InvalidRequest("data", "format");
  const payload: LayoutPayload & { version: number; plan?: string } = {
    version: 1,
    plan: typeof d.plan === "string" ? d.plan.slice(0, 100) : undefined,
    items: d.items,
    custom: d.custom ?? [],
    ...(d.walls ? { walls: d.walls } : {}),
  };
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, "utf8") > LAYOUT_MAX_BYTES) throw new Exceptions.InvalidRequest("data", "format");
  return { json, itemCount: d.items.length };
}

export interface CreateLayoutInput {
  name: string;
  json: string;
  itemCount: number;
}
export interface UpdateLayoutInput {
  name?: string;
  json?: string;
  itemCount?: number;
}

export class HouseLayoutValidator {
  static validateCreateRequest(body: Record<string, unknown>, loggingEvent?: IRequestLogEvent): CreateLayoutInput {
    const { name, data } = body as any;
    V.requiredString(name, "name", loggingEvent);
    const { json, itemCount } = cleanData(data);
    return { name: cleanName(name), json, itemCount };
  }

  static validateUpdateRequest(body: Record<string, unknown>, loggingEvent?: IRequestLogEvent): UpdateLayoutInput {
    const { name, data } = body as any;
    const out: UpdateLayoutInput = {};
    if (name !== undefined) {
      V.requiredString(name, "name", loggingEvent);
      out.name = cleanName(name);
    }
    if (data !== undefined) {
      const { json, itemCount } = cleanData(data);
      out.json = json;
      out.itemCount = itemCount;
    }
    if (Object.keys(out).length === 0) throw new Exceptions.InvalidRequest("body", "mandatory");
    return out;
  }
}
