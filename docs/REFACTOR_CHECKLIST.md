# Refactor checklist

Branch: `refactor/codebase-cleanup`. One commit per folder, made after the user approves it. Rules: [CODING_STYLE.md](./CODING_STYLE.md).

| # | Folder | Status | Commit | Notes |
|---|---|---|---|---|
| 0 | tooling + docs | [x] | 93c488e | Prettier, style guide, this checklist |
| 0b | repo-wide Prettier format | [x] | fba0a5f | formatting only |
| 1 | `connectivity` | [x] | b1af6a0 | pilot: `route()` + test, DB ping, `Connectivity.types.ts`, `ControllerResponse` collapsed onto `send()` + `RESPONSE_STATUS`, README synced |
| 2 | `debug` | [ ] | | |
| 3 | `token` | [ ] | | |
| 4 | `constants` | [ ] | | |
| 5 | `exceptions` | [ ] | | 21 single-class files; check overlap |
| 6 | `geocode` | [ ] | | |
| 7 | `mcp-api-key` | [x] removed | | deleted with MCP (see 21) |
| 8 | `ss-api-key` | [ ] | | |
| 9 | `file` | [ ] | | |
| 10 | `profile` | [ ] | | |
| 11 | `todo` | [ ] | | |
| 12 | `applepay` | [ ] | | |
| 13 | `suggestion` | [ ] | | inline `cr.result(403, ...)` ×4 → `requireRole()` |
| 14 | `house` | [ ] | | |
| 15 | `pdca` | [ ] | | replace zod with hand-written validator |
| 16 | `lta` | [ ] | | take over LTA queries now inside `KnexSqlUtilities` |
| 17 | `tgimage` | [ ] | | |
| 18 | `budget` | [ ] | | |
| 19 | `siri-shortcut` | [ ] | | |
| 20 | `hdb` | [ ] | | |
| 21 | `mcp` | [x] removed | | `/mcp`, `/mcp-key`, `mcpLimiter`, `mw.mcpPublic`, `mcp` key prefix, `@modelcontextprotocol/sdk` removed; migration 20261126000000 drops `tb_mcp_api_key` |
| 22 | `wedding` | [ ] | | uses raw `res.status` |
| 23 | `itinerary` | [ ] | | |
| 24 | `auth` | [ ] | | inline `cr.result(403, ...)` |
| 25 | `camera` | [ ] | | |
| 26 | `analytics` | [ ] | | replace zod (3 files); then `npm uninstall zod` |
| 27 | `middlewares` | [ ] | | `TokenOrApiKeyFilter.ts` unused (delete needs OK) |
| 28 | `utils` + `utils/logging` | [ ] | | rename `requestUtils.ts`, `errorUtils.ts`, typo `StructualValidationUtilities.ts`; move LTA SQL out of `KnexSqlUtilities` |
| 29 | `models` | [ ] | | move DTO/Body types into modules; `BaseEntity.throwIfInvalid` throws plain `Error` |
| 30 | `config/db`, `index.ts`, `migrate.ts` | [ ] | | |
| 31 | `migrations` | [ ] | | format only, never change logic |
| 32 | empty folders `src/log`, `src/places` | [ ] | | delete only on explicit OK |

## Cross-cutting smells (initial scan)
- 114 hand-written try/catch + `handleException` blocks → `route()`.
- Inline response types instead of named DTOs (only 4 DTOs exist).
- Only 9 modules have a `README.md`, and connectivity's is already stale.
- No formatter until now.
