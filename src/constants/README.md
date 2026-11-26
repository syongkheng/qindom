## Shared constants

Values used by more than one module. A value used by only one module stays at the top of that module's file.

| File              | Exports                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `RecordStatus.ts` | `RecordStatus.ACTIVE` (`"A"`) / `RecordStatus.DELETED` (`"D"`) + `RecordStatus` type: the soft-delete column |
| `Time.ts`         | `Time.SECOND_MS`, `MINUTE_MS`, `HOUR_MS`, `DAY_MS`                                                           |
| `Locale.ts`       | `APP_TIMEZONE` (`"Asia/Singapore"`), `DEFAULT_CURRENCY` (`"SGD"`)                                            |
| `LogEmoji.ts`     | `LogEmoji.success` / `error` / `warning` for log lines                                                       |

Naming: enum-like `as const` objects are PascalCase (`RecordStatus`, `Time`); single values are UPPER_SNAKE (`APP_TIMEZONE`).
Environment flags (`IS_PRD`…) live in `src/config/env.ts`, not here.
