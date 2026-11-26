/** 8 decimal places ≈ 1 mm: more than GPS precision, so nothing meaningful is lost. */
const COORDINATE_DECIMALS = 8;
/** Fits the VARCHAR(16) coordinate columns (`tb_hdb_pphs_coordinate`). */
const DEFAULT_MAX_CHARS = 16;
const TRAILING_ZEROS = /\.?0+$/;

/**
 * A coordinate as a short decimal string for VARCHAR storage ("1.43755612", "103.8"),
 * or null when `value` isn't a finite number. Trailing zeros are dropped, then hard-capped at `maxChars`.
 */
export function formatCoord(value: unknown, maxChars = DEFAULT_MAX_CHARS): string | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num.toFixed(COORDINATE_DECIMALS).replace(TRAILING_ZEROS, "").slice(0, maxChars);
}
