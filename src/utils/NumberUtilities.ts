import { LoggingUtilities } from "./logging/LoggingUtilities.js";

/** What mysql2 sends for a DECIMAL column: a plain decimal string such as "12.50", "-3.00", "1.30000000". */
const DECIMAL_STRING_REGEX = /^-?\d+(\.\d+)?$/;
const SERVICE_NAME = "NumberUtilities";

/**
 * A DECIMAL column value (mysql2 returns DECIMAL as a string) → a JS number for the API.
 * - `"12.50"` / `12.5` → `12.5`; `"0"` → `0`.
 * - `null` / `undefined` → `null` (NULL stays NULL, never 0).
 * - Anything else (`""`, `"abc"`, `"1e3"`, `NaN`, `Infinity`) → `null` plus a PM2 warning naming `field`:
 *   one unreadable value never fails a whole list, and it never reaches the client as NaN or a string.
 */
export function toDecimalNumber(value: number | string | null | undefined, field = "decimal"): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && DECIMAL_STRING_REGEX.test(value)) return Number(value);
  LoggingUtilities.service.warn(
    SERVICE_NAME,
    `Unreadable ${field} value ${JSON.stringify(String(value))}, read as null`,
  );
  return null;
}
