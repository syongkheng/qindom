// Shared module registry for per-module Telegram log subscriptions. Mirrors the
// route table in src/app.ts, so request routing and the subscription lookup use
// one taxonomy. When a router is mounted in app.ts, add its prefix here too
// (TelegramLogModules.test.ts fails for an Express prefix that is missing).
// fndom's admin matrix (/admin/telegram-log-subscriptions) lists whatever the server sends.
export interface TelegramLogModule {
  key: string;
  label: string;
  prefix: string;
}

/** One admin-matrix row: a module key with every prefix it covers. */
export interface TelegramLogModuleKey {
  key: string;
  label: string;
  paths: string[];
}

export const TELEGRAM_LOG_MODULES: TelegramLogModule[] = [
  { key: "connectivity", label: "Connectivity / Health Check", prefix: "/connectivity" },
  { key: "analytics", label: "Analytics", prefix: "/analytics" },
  { key: "lta", label: "LTA Bus Timing", prefix: "/lta" },
  { key: "auth", label: "Auth", prefix: "/auth" },
  { key: "profile", label: "Profile", prefix: "/pfp" },
  { key: "itinerary", label: "Travel Itinerary", prefix: "/itinerary" },
  { key: "budget", label: "Budget", prefix: "/budget" },
  { key: "todo", label: "To-do", prefix: "/todo" },
  { key: "house", label: "House Planner", prefix: "/house-layout" },
  { key: "house", label: "House Planner", prefix: "/house" },
  { key: "applepay", label: "Apple Pay", prefix: "/applepay" },
  { key: "file", label: "File Upload", prefix: "/file" },
  { key: "imghost", label: "Image Hosting (CDN)", prefix: "/img" },
  { key: "geocode", label: "Geocode", prefix: "/geocode" },
  { key: "siri-shortcut", label: "Siri Shortcut Ingestion", prefix: "/v1/ss" },
  { key: "siri-shortcut", label: "Siri Shortcut Ingestion", prefix: "/v2/ss" },
  { key: "ss-api-key", label: "Siri Shortcuts API Keys", prefix: "/ss-key" },
  { key: "wedding", label: "Wedding", prefix: "/wedding" },
  { key: "suggestion", label: "Trip Suggestions", prefix: "/suggestion" },
  { key: "camera", label: "Camera Relay", prefix: "/camera" },
  { key: "pdca", label: "PDCA Enquiry", prefix: "/pdca" },
  { key: "debug", label: "Debug (status-code test)", prefix: "/debug" },
];

// De-duplicated key/label/paths for the admin listing: a module mounted on several
// prefixes ("siri-shortcut", "house") collapses to one row with every prefix in `paths`.
export const TELEGRAM_LOG_MODULE_KEYS: TelegramLogModuleKey[] = Array.from(
  TELEGRAM_LOG_MODULES.reduce((map, m) => {
    if (!map.has(m.key)) map.set(m.key, { key: m.key, label: m.label, paths: [] });
    map.get(m.key)!.paths.push(m.prefix);
    return map;
  }, new Map<string, TelegramLogModuleKey>()).values(),
);

const SORTED_BY_PREFIX_LENGTH_DESC = [...TELEGRAM_LOG_MODULES].sort((a, b) => b.prefix.length - a.prefix.length);

/** Module key for a request path (query already stripped), or null when no prefix matches. */
export function resolveModuleKey(path: string): string | null {
  const match = SORTED_BY_PREFIX_LENGTH_DESC.find((m) => path === m.prefix || path.startsWith(m.prefix + "/"));
  return match?.key ?? null;
}
