/** Durations in milliseconds. Write `15 * Time.MINUTE_MS`, not `15 * 60 * 1000`. */
export const Time = {
  SECOND_MS: 1000,
  MINUTE_MS: 60 * 1000,
  HOUR_MS: 60 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,
} as const;
