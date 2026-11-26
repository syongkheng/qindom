import type { CorsOptions } from "cors";
import { Exceptions } from "../exceptions/AppExceptions.js";

// Reads are GET, mutations POST (user decision G1: DELETE dropped, no route or fndom call uses it).
const CORS_METHODS = "GET,POST,OPTIONS";
const PREFLIGHT_STATUS = 204;

/** `ALLOWED_ORIGINS` is a comma-separated list; blanks and surrounding spaces are ignored. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Boot check (user decision G4): an empty/blank `ALLOWED_ORIGINS` would 403 every browser origin, so
 * the server refuses to start, like a missing `JWT_SECRET` / `DB_URL`.
 */
export function requireAllowedOrigins(raw: string | undefined): string[] {
  const origins = parseAllowedOrigins(raw);
  if (origins.length === 0) {
    throw new Error("ALLOWED_ORIGINS is not set (comma-separated browser origins, e.g. https://example.com)");
  }
  return origins;
}

/**
 * Exact-match origin allow-list with credentials. Requests without an `Origin` (Shortcuts, curl,
 * server-to-server) pass. A foreign origin gets `Exceptions.ForbiddenAccess` → ErrorHandler's 403
 * registry body (the browser hides it anyway; it shows up in curl and the logs).
 */
export function createCorsOptions(allowedOrigins: readonly string[]): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Exceptions.ForbiddenAccess(`CORS: origin '${origin}' not allowed`));
    },
    methods: CORS_METHODS,
    credentials: true,
    optionsSuccessStatus: PREFLIGHT_STATUS,
  };
}
