import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { HouseLayoutBody, HouseLayoutData, HouseLayoutUpdateBody } from "./House.types.js";

// tb_house_layout.name / tb_house_share.name are VARCHAR(100).
const NAME_MAX_LENGTH = 100;
const PLAN_MAX_LENGTH = 100;
// Stored as MEDIUMTEXT; 1 MB keeps a single layout well below the 5 MB JSON request cap.
const DATA_MAX_BYTES = 1_000_000;
const MAX_ITEMS = 500;
const MAX_CUSTOM = 200;
const MAX_WALLS = 400;
/** Version of the stored envelope (not the planner's own export version). */
const DATA_FORMAT_VERSION = 1;

const isArrayOfAtMost = (value: unknown, max: number) => Array.isArray(value) && value.length <= max;

/** Checks the envelope only and returns the JSON string to store. The client re-sanitises every item and wall on load. */
function serialiseData(data: unknown, event?: IRequestLogEvent): { dataJson: string; itemCount: number } {
  const d = (data ?? {}) as Record<string, unknown>;
  const isValid =
    typeof data === "object" &&
    data !== null &&
    isArrayOfAtMost(d.items, MAX_ITEMS) &&
    (d.custom === undefined || isArrayOfAtMost(d.custom, MAX_CUSTOM)) &&
    (d.walls === undefined || isArrayOfAtMost(d.walls, MAX_WALLS));
  event?.children?.push(`'data' envelope ${isValid ? LogEmoji.success : LogEmoji.error} `);
  if (!isValid) throw new Exceptions.InvalidRequest("data", "format");

  const items = d.items as unknown[];
  const stored: HouseLayoutData = {
    version: DATA_FORMAT_VERSION,
    plan: typeof d.plan === "string" ? d.plan.slice(0, PLAN_MAX_LENGTH) : undefined,
    items,
    custom: (d.custom as unknown[] | undefined) ?? [],
    ...(d.walls ? { walls: d.walls as unknown[] } : {}),
  };
  const dataJson = JSON.stringify(stored);
  if (Buffer.byteLength(dataJson, "utf8") > DATA_MAX_BYTES) throw new Exceptions.InvalidRequest("data", "format");
  return { dataJson, itemCount: items.length };
}

/** `{ name, data }` for a new layout or a new share link. */
export function validateLayoutBody(body: Record<string, unknown>, event?: IRequestLogEvent): HouseLayoutBody {
  const name = V.requiredText(body.name, "name", NAME_MAX_LENGTH, event);
  return { name, ...serialiseData(body.data, event) };
}

export function validateLayoutUpdateBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): HouseLayoutUpdateBody {
  const update: HouseLayoutUpdateBody = {};
  if (body.name !== undefined) update.name = V.requiredText(body.name, "name", NAME_MAX_LENGTH, event);
  if (body.data !== undefined) Object.assign(update, serialiseData(body.data, event));
  if (Object.keys(update).length === 0) throw new Exceptions.InvalidRequest("body", "mandatory");
  return update;
}
