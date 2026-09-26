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
  { key: "analytics", label: "Analytics", prefix: "/analytics" },
  { key: "hdb", label: "HDB / PPHS", prefix: "/hdb" },
  { key: "lta", label: "LTA Bus Timing", prefix: "/lta" },
  { key: "auth", label: "Auth", prefix: "/auth" },
  { key: "profile", label: "Profile", prefix: "/pfp" },
  { key: "itinerary", label: "Travel Itinerary", prefix: "/itinerary" },
  { key: "budget", label: "Budget", prefix: "/budget" },
  { key: "applepay", label: "Apple Pay", prefix: "/applepay" },
  { key: "file", label: "File Upload", prefix: "/file" },
  { key: "imghost", label: "Image Hosting (CDN)", prefix: "/img" },
  { key: "geocode", label: "Geocode", prefix: "/geocode" },
  { key: "trail", label: "Trail", prefix: "/trail" },
  { key: "llm", label: "LLM Marketplace", prefix: "/v1/llm" },
  { key: "siri-shortcut", label: "Siri Shortcut Ingestion", prefix: "/v1/ss" },
  { key: "siri-shortcut", label: "Siri Shortcut Ingestion", prefix: "/v2/ss" },
  { key: "ss-api-key", label: "Siri Shortcuts API Keys", prefix: "/ss-key" },
  { key: "iot", label: "IoT", prefix: "/iot" },
  { key: "iot", label: "IoT", prefix: "/iot-key" },
  { key: "wedding", label: "Wedding", prefix: "/wedding" },
  { key: "suggestion", label: "Trip Suggestions", prefix: "/suggestion" },
  { key: "garmin", label: "Garmin Health", prefix: "/garmin" },
];

// De-duplicated key/label/paths triples for admin listing — "iot" appears
// twice above (two mounted prefixes, one module) so listing must collapse
// that down to a single row with both prefixes surfaced in `paths`.
export const TELEGRAM_LOG_MODULE_KEYS: { key: string; label: string; paths: string[] }[] = Array.from(
  TELEGRAM_LOG_MODULES.reduce((map, m) => {
    if (!map.has(m.key)) map.set(m.key, { key: m.key, label: m.label, paths: [] });
    map.get(m.key)!.paths.push(m.prefix);
    return map;
  }, new Map<string, { key: string; label: string; paths: string[] }>()).values(),
);

const SORTED_BY_PREFIX_LENGTH_DESC = [...TELEGRAM_LOG_MODULES].sort((a, b) => b.prefix.length - a.prefix.length);

export function resolveModuleKey(path: string): string | null {
  const match = SORTED_BY_PREFIX_LENGTH_DESC.find((m) => path === m.prefix || path.startsWith(m.prefix + "/"));
  return match?.key ?? null;
}
