// Shared module registry for per-module Telegram log subscriptions — mirrors
// the route-mounting table in src/index.ts so both request routing and the
// subscription lookup use the same source of truth instead of two taxonomies.
// If a new router is mounted in index.ts, add its prefix/key here too.
export interface TelegramLogModule {
  key: string;
  label: string;
  prefix: string;
}

export const TELEGRAM_LOG_MODULES: TelegramLogModule[] = [
  { key: "connectivity", label: "Connectivity / Health Check", prefix: "/connectivity" },
  { key: "analytics", label: "Analytics", prefix: "/api/analytics" },
  { key: "hdb", label: "HDB / PPHS", prefix: "/api/hdb" },
  { key: "lta", label: "LTA Bus Timing", prefix: "/api/lta" },
  { key: "auth", label: "Auth", prefix: "/api/auth" },
  { key: "profile", label: "Profile", prefix: "/api/pfp" },
  { key: "itinerary", label: "Travel Itinerary", prefix: "/api/itinerary" },
  { key: "budget", label: "Budget", prefix: "/api/budget" },
  { key: "applepay", label: "Apple Pay", prefix: "/api/applepay" },
  { key: "file", label: "File Upload", prefix: "/api/file" },
  { key: "imghost", label: "Image Hosting (CDN)", prefix: "/api/img" },
  { key: "geocode", label: "Geocode", prefix: "/api/geocode" },
  { key: "trail", label: "Trail", prefix: "/api/trail" },
  { key: "llm", label: "LLM Marketplace", prefix: "/v1/llm" },
  { key: "siri-shortcut", label: "Siri Shortcut Ingestion", prefix: "/v1/ss" },
  { key: "ss-api-key", label: "Siri Shortcuts API Keys", prefix: "/api/ss-key" },
  { key: "aig", label: "AIG API Keys", prefix: "/api/aig" },
  { key: "iot", label: "IoT", prefix: "/iot" },
  { key: "iot", label: "IoT", prefix: "/api/iot-key" },
  { key: "wedding", label: "Wedding", prefix: "/wedding" },
  { key: "suggestion", label: "Trip Suggestions", prefix: "/api/suggestion" },
  { key: "garmin", label: "Garmin Health", prefix: "/api/garmin" },
  { key: "places", label: "Places", prefix: "/api/places" },
];

// De-duplicated key/label pairs for admin listing — "iot" appears twice above
// (two mounted prefixes, one module) so listing must collapse that down to
// a single row.
export const TELEGRAM_LOG_MODULE_KEYS: { key: string; label: string }[] = Array.from(
  new Map(TELEGRAM_LOG_MODULES.map((m) => [m.key, m.label])),
).map(([key, label]) => ({ key, label }));

const SORTED_BY_PREFIX_LENGTH_DESC = [...TELEGRAM_LOG_MODULES].sort((a, b) => b.prefix.length - a.prefix.length);

export function resolveModuleKey(path: string): string | null {
  const match = SORTED_BY_PREFIX_LENGTH_DESC.find((m) => path === m.prefix || path.startsWith(m.prefix + "/"));
  return match?.key ?? null;
}
