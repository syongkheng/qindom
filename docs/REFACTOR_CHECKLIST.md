# Refactor checklist

Branch: `refactor/codebase-cleanup`. One commit per folder, made after the user approves it. Rules: [CODING_STYLE.md](./CODING_STYLE.md).

| # | Folder | Status | Commit | Notes |
|---|---|---|---|---|
| 0 | tooling + docs | [x] | 93c488e | Prettier, style guide, this checklist |
| 0b | repo-wide Prettier format | [x] | fba0a5f | formatting only |
| 1 | `connectivity` | [x] | b1af6a0 | pilot: `route()` + test, DB ping, `Connectivity.types.ts`, `ControllerResponse` collapsed onto `send()` + `ResponseStatus`, README synced |
| 2 | `debug` | [x] | 17842c7 | `route()`, `requireRole()` (new), `IS_PRD` from `config/env.ts` (new), named status constants, `Debug.types.ts`, README created, factory takes no `db` |
| 3 | `token` | [x] | 9c9a280 | `signToken`/`verifyToken`/`getJwtSecret` functions; `JWT_ALGORITHM` + `JWT_TTL_MS` single source (cookie maxAge uses it); callers in auth, profile, TokenFilter switched; boot fail-fast in index.ts; tests + README |
| 4 | `constants` | [x] | 6a96864 | added `RecordStatus`, `Time`, `Locale` + README; `RESPONSE_STATUS` → `ResponseStatus`; `JWT_TTL_MS` uses `Time`; raw emoji in LoggingUtilities → `LogEmoji` |
| 5 | `exceptions` | [x] | 511bae4 | 21 files → `AppExceptions.ts` (registry only); deleted EntityRetrieval/ParseJson/TokenExpired/TokenFormat; statuses fixed (502/500/429/400); `invalid_request_generic`; NotFound/Unauthorized take a message; `BaseExceptions` → `BaseException`; tests + README |
| 6 | `geocode` | [~] in review | | `route()` + `cr.ok<NominatimPlaceDto[]>`; `Geocode.types.ts`; logContext → request tree (SQL timings, cache hit/miss); `URLSearchParams` + named limit; dup gap lambda; tests (cache hit/miss/failure) + README; `LoggingUtilities.request.branch` accepts undefined context |
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
| 27 | `middlewares` | [ ] | | `ApiKeyFilter` passes a sentence to `InvalidRequest` (code `invalid_request_Invalid API key`); `TokenOrApiKeyFilter.ts` unused (delete needs OK) |
| 28 | `utils` + `utils/logging` | [ ] | | `KnexSqlUtilities.findOne` names its param `logContext` but it's an `IRequestLogEvent`;  `LoggingUtilities` imports dotenv (why?); rename `requestUtils.ts`, `errorUtils.ts`, typo `StructualValidationUtilities.ts`; move LTA SQL out of `KnexSqlUtilities` |
| 29 | `models` | [ ] | | move `IDecodedTokenUser` → `token/Token.types.ts`; move DTO/Body types into modules; `BaseEntity.throwIfInvalid` throws plain `Error` |
| 30 | `config/db`, `index.ts`, `migrate.ts` | [ ] | | index.ts still compares `NODE_ENV` inline → `config/env.ts` | |
| 31 | `migrations` | [ ] | | format only, never change logic |
| 32 | empty folders `src/log`, `src/places` | [ ] | | delete only on explicit OK |

## Cross-cutting smells (initial scan)
- 176 raw `record_status` `'A'`/`'D'` → `RecordStatus` (each folder).
- ~29 hand-written durations (`60 * 1000`…) → `Time` (each folder).
- `"SGD"` ×9, `"Asia/Singapore"` ×5 → `Locale.ts` (applepay, siri-shortcut, analytics, wedding).
- 7 files compare `NODE_ENV` inline / keep local `isPrd` → `config/env.ts` (each folder).
- 15 defensive `req.logContext` guards → remove (each folder).
- 114 hand-written try/catch + `handleException` blocks → `route()`.
- Inline response types instead of named DTOs (only 4 DTOs exist).
- Only 9 modules have a `README.md`, and connectivity's is already stale.
- No formatter until now.
