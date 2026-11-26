import type { CorsOptions } from "cors";
import { Exceptions } from "../exceptions/AppExceptions.js";

// DELETE stays allowed for now even though no route uses it any more (mutations are POST).
const CORS_METHODS = "GET,POST,DELETE,OPTIONS";
const PREFLIGHT_STATUS = 204;

/** `ALLOWED_ORIGINS` is a comma-separated list; blanks and surrounding spaces are ignored. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
