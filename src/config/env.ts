/**
 * Runtime environment flags. `NODE_ENV` is set by the npm script / PM2 (not by dotenv),
 * so these are safe to read at import time. Import these instead of comparing `process.env.NODE_ENV`.
 */
export const APP_ENV = process.env.NODE_ENV ?? "unknown";
export const IS_PRD = APP_ENV === "prd";
export const IS_DEV = APP_ENV === "dev";
