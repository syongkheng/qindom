import { z } from "zod";

/**
 * Analytics ingest contract v1 — the ONE fixed shape every frontend sends to
 * POST /analytics/collect. Frontends can copy this file's shape verbatim.
 *
 * {
 *   "v": 1,
 *   "system": "jessikheng",                 // must be an active row in tb_analytic_system
 *   "event": "page_view",                   // snake_case, ≤64 chars
 *   "sessionId": "uuid",
 *   "timestamp": 1763540000000,             // epoch ms (client clock; server clamps)
 *   "page": "/#/status",
 *   "referrer": "https://…",
 *   "screen": {
 *     "width": 390, "height": 844,
 *     "breakpoint": "phone",                // the system's own breakpoint key
 *     "size": "small"                       // normalised: small | medium | large
 *   },
 *   "properties": {}                        // ≤4KB JSON
 * }
 */

export const SCREEN_SIZES = ["small", "medium", "large"] as const;
export type ScreenSize = (typeof SCREEN_SIZES)[number];
export const UNKNOWN = "unknown";

/** Events that count as a "view" on the dashboard. `pageView` is the legacy camelCase name. */
export const PAGE_VIEW_EVENTS = ["page_view", "pageView"] as const;

export const MAX_PROPERTIES_BYTES = 4096;
/** Client clocks drift; anything further than this from server time is replaced with server time. */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export const BreakpointSchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  label: z.string().min(1).max(64),
  maxWidth: z.number().int().positive().nullable(),
  size: z.enum(SCREEN_SIZES),
});
export type AnalyticsBreakpoint = z.infer<typeof BreakpointSchema>;

export const SystemKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const CollectRequestSchema = z.object({
  v: z.literal(1),
  system: SystemKeySchema,
  event: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  sessionId: z.string().min(1).max(64),
  timestamp: z.number().int().nonnegative().optional(),
  page: z.string().max(512).optional().default(""),
  referrer: z.string().max(512).optional().default(""),
  screen: z
    .object({
      width: z.number().int().nonnegative().max(100000),
      height: z.number().int().nonnegative().max(100000),
      breakpoint: z.string().max(32).optional(),
      size: z.string().max(16).optional(),
    })
    .optional(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
});
export type CollectRequest = z.infer<typeof CollectRequestSchema>;

export interface RegisteredSystem {
  key: string;
  displayName: string;
  breakpoints: AnalyticsBreakpoint[];
  allowedOrigins: string[];
}

export interface NormalisedEvent {
  system: string;
  event: string;
  sessionId: string;
  timestamp: number;
  page: string;
  referrer: string;
  properties: Record<string, unknown>;
  screenWidth: number | null;
  screenHeight: number | null;
  screenBreakpoint: string;
  screenSize: string;
}

export type ParseResult =
  | { ok: true; value: CollectRequest }
  | { ok: false; field: string };

/** Structural validation only (no registry lookup). */
export function parseCollectRequest(body: unknown): ParseResult {
  const parsed = CollectRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, field: issue?.path.join(".") || "body" };
  }
  if (Buffer.byteLength(JSON.stringify(parsed.data.properties), "utf8") > MAX_PROPERTIES_BYTES) {
    return { ok: false, field: "properties" };
  }
  return { ok: true, value: parsed.data };
}

/** Breakpoint key a width falls into, per the system's ordered breakpoints. */
export function breakpointForWidth(breakpoints: AnalyticsBreakpoint[], width: number): AnalyticsBreakpoint | undefined {
  return breakpoints.find((b) => b.maxWidth === null || width <= b.maxWidth) ?? breakpoints[breakpoints.length - 1];
}

/**
 * Resolve screen.breakpoint / screen.size against the system's registry entry:
 *  - breakpoint must be one of the system's keys, else 'unknown'
 *  - size is taken from the client if valid, else derived from the breakpoint mapping, else 'unknown'
 */
export function resolveScreen(
  system: RegisteredSystem,
  screen: CollectRequest["screen"],
): { breakpoint: string; size: string } {
  if (!screen) return { breakpoint: UNKNOWN, size: UNKNOWN };
  const bp = system.breakpoints.find((b) => b.key === screen.breakpoint);
  const breakpoint = bp ? bp.key : UNKNOWN;
  const clientSize = SCREEN_SIZES.find((s) => s === screen.size);
  const size = clientSize ?? bp?.size ?? UNKNOWN;
  return { breakpoint, size };
}

/** Empty allowlist = no origin restriction. A request without an Origin header (curl, server) is allowed. */
export function isOriginAllowed(system: RegisteredSystem, origin: string | undefined): boolean {
  if (!origin || system.allowedOrigins.length === 0) return true;
  return system.allowedOrigins.includes(origin);
}

export function normaliseEvent(system: RegisteredSystem, req: CollectRequest, now = Date.now()): NormalisedEvent {
  const { breakpoint, size } = resolveScreen(system, req.screen);
  const ts = req.timestamp;
  const timestamp = ts !== undefined && Math.abs(now - ts) <= MAX_CLOCK_SKEW_MS ? ts : now;
  return {
    system: system.key,
    event: req.event,
    sessionId: req.sessionId,
    timestamp,
    page: req.page,
    referrer: req.referrer,
    properties: req.properties,
    screenWidth: req.screen?.width ?? null,
    screenHeight: req.screen?.height ?? null,
    screenBreakpoint: breakpoint,
    screenSize: size,
  };
}
