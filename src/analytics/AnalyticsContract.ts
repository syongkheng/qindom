import { Time } from "../constants/Time.js";
import { AnalyticsCollectBody, NormalisedEvent, RegisteredSystem, SCREEN_SIZES } from "./Analytics.types.js";

/**
 * Analytics ingest contract v1 — the ONE fixed shape every frontend sends to
 * POST /analytics/collect. Frontends can copy this file's shape verbatim.
 * (Validation: `validateCollectBody` in Analytics.validator.ts; types in Analytics.types.ts.)
 *
 * {
 *   "v": 1,
 *   "system": "jessikheng",                 // must be an active row in tb_analytic_system
 *   "event": "page_view",                   // snake_case, ≤64 chars
 *   "sessionId": "uuid",                    // ≤64 chars
 *   "timestamp": 1763540000000,             // epoch ms (client clock; server clamps)
 *   "page": "/#/status",                    // ≤512 chars
 *   "referrer": "https://…",                // ≤512 chars
 *   "screen": {
 *     "width": 390, "height": 844,          // whole numbers 0–100000
 *     "breakpoint": "phone",                // the system's own breakpoint key
 *     "size": "small"                       // normalised: small | medium | large
 *   },
 *   "properties": {}                        // ≤4KB JSON
 * }
 */

/** Stored for a breakpoint/size the system doesn't know. */
export const UNKNOWN = "unknown";

/** Events that count as a "view" on the dashboard. `pageView` is the legacy camelCase name. */
export const PAGE_VIEW_EVENTS = ["page_view", "pageView"] as const;

/** Client clocks drift; anything further than this from server time is replaced with server time. */
const MAX_CLOCK_SKEW_MS = Time.DAY_MS;

/**
 * Resolve screen.breakpoint / screen.size against the system's registry entry:
 *  - breakpoint must be one of the system's keys, else 'unknown'
 *  - size is taken from the client if valid, else derived from the breakpoint mapping, else 'unknown'
 */
export function resolveScreen(
  system: RegisteredSystem,
  screen: AnalyticsCollectBody["screen"],
): { breakpoint: string; size: string } {
  if (!screen) return { breakpoint: UNKNOWN, size: UNKNOWN };
  const bp = system.breakpoints.find((b) => b.key === screen.breakpoint);
  const breakpoint = bp ? bp.key : UNKNOWN;
  const clientSize = SCREEN_SIZES.find((s) => s === screen.size);
  const size = clientSize ?? bp?.size ?? UNKNOWN;
  return { breakpoint, size };
}

/**
 * Empty allowlist = no origin restriction. A request without an Origin header (curl, server) is allowed:
 * the check only stops other websites' browsers. PDCA enquiries use the stricter `isEnquiryOriginAllowed`.
 */
export function isOriginAllowed(system: Pick<RegisteredSystem, "allowedOrigins">, origin: string | undefined): boolean {
  if (!origin || system.allowedOrigins.length === 0) return true;
  return system.allowedOrigins.includes(origin);
}

export function normaliseEvent(system: RegisteredSystem, req: AnalyticsCollectBody, now = Date.now()): NormalisedEvent {
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
