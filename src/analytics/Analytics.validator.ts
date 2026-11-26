import { Request } from "express";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { clientIp } from "../utils/RequestUtilities.js";
import {
  AnalyticsBreakpoint,
  AnalyticsCollectBody,
  AnalyticsCollectScreen,
  AnalyticsGrantBody,
  AnalyticsHeartbeatBody,
  AnalyticsRequestMeta,
  AnalyticsSystemBody,
  SCREEN_SIZES,
  ScreenSize,
} from "./Analytics.types.js";

// Hand-written replacement for the zod schemas analytics used until Nov 2026. It accepts and rejects
// exactly the same inputs (pinned by Analytics.validator.test.ts): unknown keys are dropped, strings are
// measured in Unicode code points (like MySQL VARCHAR), and the error names the FIRST failing field in
// declaration order as a dotted path (`screen.width`, `breakpoints.0.key`) or `body`.

const SYSTEM_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/; // tb_analytic_system.system_key VARCHAR(64)
const EVENT_REGEX = /^[a-z][a-z0-9_]{0,63}$/; // tb_analytic_event.event VARCHAR(64)
const BREAKPOINT_KEY_REGEX = /^[A-Za-z0-9_-]{1,32}$/; // fits tb_analytic_event.screen_breakpoint VARCHAR(32)
const ORIGIN_REGEX = /^https?:\/\/[^/\s]+$/;

const COLLECT_VERSION = 1;
const SESSION_ID_MAX_LENGTH = 64; // tb_analytic_event.session_id VARCHAR(64)
const PAGE_MAX_LENGTH = 512; // tb_analytic_event.page / referrer VARCHAR(512)
const SCREEN_DIMENSION_MAX = 100_000;
const SCREEN_BREAKPOINT_MAX_LENGTH = 32; // tb_analytic_event.screen_breakpoint VARCHAR(32)
const SCREEN_SIZE_MAX_LENGTH = 16; // tb_analytic_event.screen_size VARCHAR(16)
/** `properties` is stored as JSON; its UTF-8 size is capped. */
const MAX_PROPERTIES_BYTES = 4096;

const DISPLAY_NAME_MAX_LENGTH = 128; // tb_analytic_system.display_name VARCHAR(128)
const BREAKPOINT_LABEL_MAX_LENGTH = 64;
const MIN_BREAKPOINTS = 1;
const MAX_BREAKPOINTS = 12;
const MAX_ALLOWED_ORIGINS = 20;
const USERNAME_MAX_LENGTH = 128;

const UNKNOWN_CLIENT = "Unknown";

export const DEFAULT_SUMMARY_HOURS = 24;
export const MAX_SUMMARY_HOURS = 168;

type Json = Record<string, unknown>;

const invalid = (path: string) => new Exceptions.InvalidRequest(path, "format");

/** Any non-null, non-array object (what a JSON object body is). */
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Code points, not UTF-16 units: an emoji counts as one character, as in a utf8mb4 VARCHAR. */
const lengthWithin = (value: string, min: number, max: number) => {
  const length = value.length > max || value.length < min * 2 ? [...value].length : value.length;
  return length >= min && length <= max;
};

function text(value: unknown, path: string, min: number, max: number): string {
  if (typeof value !== "string" || !lengthWithin(value, min, max)) throw invalid(path);
  return value;
}

function matching(value: unknown, pattern: RegExp, path: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw invalid(path);
  return value;
}

function wholeNumber(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw invalid(path);
  return value as number;
}

/** Length is checked before the items, so a too-long list reports the list itself. */
function list<T>(value: unknown, path: string, min: number, max: number, item: (v: unknown, path: string) => T): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw invalid(path);
  return value.map((v, i) => item(v, `${path}.${i}`));
}

/** A plain JSON object, copied key by key (a `__proto__` key is dropped, never assigned). */
function plainRecord(value: unknown, path: string): Json {
  if (!isObject(value)) throw invalid(path);
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) throw invalid(path);
  const copy: Json = {};
  for (const key of Object.keys(value)) {
    if (key !== "__proto__") copy[key] = value[key];
  }
  return copy;
}

function screen(value: unknown, path: string): AnalyticsCollectScreen {
  if (!isObject(value)) throw invalid(path);
  return {
    width: wholeNumber(value.width, `${path}.width`, 0, SCREEN_DIMENSION_MAX),
    height: wholeNumber(value.height, `${path}.height`, 0, SCREEN_DIMENSION_MAX),
    breakpoint:
      value.breakpoint === undefined
        ? undefined
        : text(value.breakpoint, `${path}.breakpoint`, 0, SCREEN_BREAKPOINT_MAX_LENGTH),
    size: value.size === undefined ? undefined : text(value.size, `${path}.size`, 0, SCREEN_SIZE_MAX_LENGTH),
  };
}

function breakpoint(value: unknown, path: string): AnalyticsBreakpoint {
  if (!isObject(value)) throw invalid(path);
  const key = matching(value.key, BREAKPOINT_KEY_REGEX, `${path}.key`);
  const label = text(value.label, `${path}.label`, 1, BREAKPOINT_LABEL_MAX_LENGTH);
  const maxWidth = value.maxWidth === null ? null : wholeNumber(value.maxWidth, `${path}.maxWidth`, 1);
  if (!SCREEN_SIZES.includes(value.size as ScreenSize)) throw invalid(`${path}.size`);
  return { key, label, maxWidth, size: value.size as ScreenSize };
}

/**
 * `POST /analytics/collect` (contract v1, see AnalyticsContract.ts). Structural only: the system's
 * registry lookup and origin check happen in the service. `page`/`referrer` default to "", `properties` to {}.
 */
export function validateCollectBody(body: unknown): AnalyticsCollectBody {
  if (!isObject(body)) throw invalid("body");
  if (body.v !== COLLECT_VERSION) throw invalid("v");
  const result: AnalyticsCollectBody = {
    v: COLLECT_VERSION,
    system: matching(body.system, SYSTEM_KEY_REGEX, "system"),
    event: matching(body.event, EVENT_REGEX, "event"),
    sessionId: text(body.sessionId, "sessionId", 1, SESSION_ID_MAX_LENGTH),
    timestamp: body.timestamp === undefined ? undefined : wholeNumber(body.timestamp, "timestamp", 0),
    page: body.page === undefined ? "" : text(body.page, "page", 0, PAGE_MAX_LENGTH),
    referrer: body.referrer === undefined ? "" : text(body.referrer, "referrer", 0, PAGE_MAX_LENGTH),
    screen: body.screen === undefined ? undefined : screen(body.screen, "screen"),
    properties: body.properties === undefined ? {} : plainRecord(body.properties, "properties"),
  };
  if (Buffer.byteLength(JSON.stringify(result.properties), "utf8") > MAX_PROPERTIES_BYTES) throw invalid("properties");
  return result;
}

/** `POST /analytics/admin/systems`. `displayName` is trimmed; `allowedOrigins` defaults to [], `active` to true. */
export function validateSystemBody(body: unknown): AnalyticsSystemBody {
  if (!isObject(body)) throw invalid("body");
  const key = matching(body.key, SYSTEM_KEY_REGEX, "key");
  if (typeof body.displayName !== "string") throw invalid("displayName");
  const displayName = text(body.displayName.trim(), "displayName", 1, DISPLAY_NAME_MAX_LENGTH);
  const breakpoints = list(body.breakpoints, "breakpoints", MIN_BREAKPOINTS, MAX_BREAKPOINTS, breakpoint);
  const allowedOrigins =
    body.allowedOrigins === undefined
      ? []
      : list(body.allowedOrigins, "allowedOrigins", 0, MAX_ALLOWED_ORIGINS, (v, path) =>
          matching(v, ORIGIN_REGEX, path),
        );
  if (body.active !== undefined && typeof body.active !== "boolean") throw invalid("active");
  return { key, displayName, breakpoints, allowedOrigins, active: body.active ?? true };
}

/** `POST /analytics/admin/systems/:key/access`. Any problem is `invalid_request_username` (no error type). */
export function validateGrantBody(body: unknown): AnalyticsGrantBody {
  const raw = isObject(body) ? body.username : undefined;
  const username = typeof raw === "string" ? raw.trim() : "";
  if (!lengthWithin(username, 1, USERNAME_MAX_LENGTH)) throw new Exceptions.InvalidRequest("username");
  return { username };
}

/** `:userId` in `.../access/:userId/revoke`: a positive whole number. */
export function validateUserIdParam(raw: unknown): number {
  const userId = Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) throw invalid("userId");
  return userId;
}

/** `?hours=` of the summary: lenient, never a 400. Missing/0/garbage → 24, then clamped to 1..168. */
export function parseSummaryHours(raw: unknown): number {
  return Math.min(Math.max(Math.trunc(Number(raw)) || DEFAULT_SUMMARY_HOURS, 1), MAX_SUMMARY_HOURS);
}

/** `tb_analytic_system.breakpoints` (parsed JSON). Null unless it is a list of valid breakpoints. */
export function parseStoredBreakpoints(value: unknown): AnalyticsBreakpoint[] | null {
  try {
    return list(value, "breakpoints", 0, Infinity, breakpoint);
  } catch {
    return null;
  }
}

/** `tb_analytic_system.allowed_origins` (parsed JSON). Null unless it is a list of strings. */
export function parseStoredOrigins(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
}

/** `POST /analytics/heartbeat` (frozen): presence checks only. */
export function validateHeartbeatBody(body: unknown): AnalyticsHeartbeatBody {
  const b: Json = isObject(body) ? body : {};
  if (!b.sessionId) throw new Exceptions.InvalidRequest("sessionId");
  if (!b.system) throw new Exceptions.InvalidRequest("system");
  return { sessionId: b.sessionId as string, system: b.system as string };
}

/** Who sent an event, from the request (never the body): username ("" for visitors), client IP, user agent. */
export function readRequestMeta(req: Request): AnalyticsRequestMeta {
  return {
    userId: req.user?.username ?? "",
    ipAddress: clientIp(req),
    userAgent: req.headers["user-agent"] || UNKNOWN_CLIENT,
  };
}
