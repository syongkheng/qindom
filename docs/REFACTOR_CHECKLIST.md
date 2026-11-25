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
| 6 | `geocode` | [x] | f91e15e | `route()` + `cr.ok<NominatimPlaceDto[]>`; `Geocode.types.ts`; logContext → request tree (SQL timings, cache hit/miss); `URLSearchParams` + named limit; dup gap lambda; tests (cache hit/miss/failure) + README; `LoggingUtilities.request.branch` accepts undefined context |
| 7 | `mcp-api-key` | [x] removed | | deleted with MCP (see 21) |
| 8 | `ss-api-key` | [x] | 29974cb | `route()` + typed `cr.ok`; `SsApiKey.types.ts`; validator → function; `RecordStatus`; named constants; consistent `logContext?`; `sha256Hex` shared with ApiKeyFilter; DELETE → `POST /api-key/delete` (fndom); tests + README |
| 9 | `file` | [x] | a005e9d | dead `POST /file/tg` deleted (+ fndom `CREATE_TG`); `route()` + `cr.ok<FileDeletedDto>`; `File.types.ts`; validator → function (uuid strings, ≤100); `RecordStatus` bindings; real `affectedRows` count; logContext; tests + README rewritten |
| 10 | `profile` | [x] | 5001889 | `Pfp.*` → `Profile.*`; mounted `mw.auth` (per-route filters dropped); `route()` + typed DTOs; validators (country, image data URL, shared `validateUsername`); no more user rows in responses; no try/catch→Unknown; lookups by id; one atomic username+token update; `parseRoles` shared; tests + README |
| 11 | `todo` | [x] | 009fe60 | `route()` + typed DTOs (no more `any`); `Todo.types.ts`; validators → functions; pin cap → `InvalidRequest("pinned","limit")`; `RecordStatus`; logContext through every query; shared `activeTasks`; widget call typed; tests + README (none before) |
| 12 | `applepay` | [x] | c5736ee | service moved in from siri-shortcut (`ApplePayService`) + body types from models/requests; `ApplePayDashboard.*` → `ApplePay.*`; `route()` + typed DTOs; validators → functions with 64-char caps on category/label (were unchecked); `TransactionSource`; `RecordStatus`; shared `setRecordStatus`/`loadOrThrow`; `getApiKeyUserId` (siri-shortcut + todo widget); tests + README |
| 13 | `suggestion` | [x] | e865502 | `route()` + `requireRole(ADMIN_ROLES)`; DELETE ×2 → `POST /:id/delete`; raw rows → camelCase DTOs (fndom panels); `Suggestion.types.ts`; validators → functions w/ column caps, http(s) url, whole counts; `RecordStatus`; `any` casts gone; shared `V.requiredText/optionalText` (applepay switched); tests + README |
| 14 | `house` | [x] | cc9bb4a | `route()` ×8 + typed DTOs (no `any`); `House.types.ts`; `HouseLayout.validator` → shared `House.validator.ts` functions (`requiredText`, named limits, format version); caps → `InvalidRequest("layouts"/"shares","limit")`; `RecordStatus`; logContext; share list sorted in SQL; view selects only needed columns; tests + README (none before) |
| 15 | `pdca` | [~] in review | | zod → `PdcaEnquiry.validator.ts`; `PdcaEnquiry.ts` → `.service.ts` (+ `PdcaEnquiryService.submit`, sending moved out of controller); `.types.ts`; log-scrub middleware → `.middleware.ts`; Origin now required (`isEnquiryOriginAllowed`); lab contact details + timezone named; `route()`; tests ported + send-flow tests; README |
| 16 | `lta` | [ ] | | take over LTA queries now inside `KnexSqlUtilities` |
| 17 | `tgimage` | [ ] | | |
| 18 | `budget` | [ ] | | |
| 19 | `siri-shortcut` | [ ] | | widget/ApplePay controllers read `logContext.metadata.userId as number` (ApiKeyFilter should set `req.user` so `getUser()` works); hand-written route code; |
| 20 | `hdb` | [ ] | | |
| 21 | `mcp` | [x] removed | | `/mcp`, `/mcp-key`, `mcpLimiter`, `mw.mcpPublic`, `mcp` key prefix, `@modelcontextprotocol/sdk` removed; migration 20261126000000 drops `tb_mcp_api_key` |
| 22 | `wedding` | [ ] | | uses raw `res.status` |
| 23 | `itinerary` | [ ] | | file inserts (`_filesToInsert`) don't validate `tgShortCode` ownership or `mimeType` (moved here from `file`) |
| 24 | `auth` | [ ] | | Auth.service still parses roles by hand ×2 → `parseRoles`; `AuthValidator` static class (only `validateUsername` is a function so far); inline `cr.result(403, ...)` |
| 25 | `camera` | [ ] | | |
| 26 | `analytics` | [ ] | | replace zod (3 files; last users); then `npm uninstall zod`; `isOriginAllowed` lets a missing Origin through (deliberate for /collect? pdca now has its own stricter check) |
| 27 | `middlewares` | [ ] | | CORS rejection answers `{status:"Forbidden", data:"CORS: origin … not allowed"}` (not the registry error shape); `ApiKeyFilter` passes a sentence to `InvalidRequest` (code `invalid_request_Invalid API key`); `TokenOrApiKeyFilter.ts` unused (delete needs OK) |
| 28 | `utils` + `utils/logging` | [ ] | | `KnexSqlUtilities.transaction` hands out a raw knex trx (todo reorder can't log its N updates);  `KnexSqlUtilities.raw` takes no log event (raw SQL never appears in the request tree);  `KnexSqlUtilities.findOne` names its param `logContext` but it's an `IRequestLogEvent`;  `LoggingUtilities` imports dotenv (why?); rename `requestUtils.ts`, `errorUtils.ts`, typo `StructualValidationUtilities.ts`; move LTA SQL out of `KnexSqlUtilities` |
| 29 | `models` | [ ] | | move `IDecodedTokenUser` → `token/Token.types.ts`; move DTO/Body types into modules; `BaseEntity.throwIfInvalid` throws plain `Error` |
| 30 | `config/db`, `index.ts`, `migrate.ts` | [ ] | | index.ts still compares `NODE_ENV` inline → `config/env.ts` | |
| 31 | `migrations` | [ ] | | format only, never change logic |
| 32 | empty folders `src/log`, `src/places` | [ ] | | delete only on explicit OK |

## fndom companion branch
`refactor/qindom-alignment` (unpushed): MCP key UI removed; ss-key revoke → `POST /ss-key/api-key/delete`; unused `ApiRoute.FILE.CREATE_TG` removed; suggestion panels → camelCase + delete routes → POST. **Deploy fndom together with qindom.**

## Cross-cutting smells (initial scan)
- 5 inline `crypto.createHash("sha256")` → `sha256Hex()` (ss-api-key + ApiKeyFilter done; auth, camera, analytics left).
- ~10 static-class validators → exported functions (each folder).
- ~~Remaining `router.delete` routes~~ none left.
- 176 raw `record_status` `'A'`/`'D'` → `RecordStatus` (each folder).
- ~29 hand-written durations (`60 * 1000`…) → `Time` (each folder).
- `"SGD"` ×9, `"Asia/Singapore"` ×5 → `Locale.ts` (applepay, siri-shortcut, analytics, wedding).
- 7 files compare `NODE_ENV` inline / keep local `isPrd` → `config/env.ts` (each folder).
- 15 defensive `req.logContext` guards → remove (each folder).
- 114 hand-written try/catch + `handleException` blocks → `route()`.
- Inline response types instead of named DTOs (only 4 DTOs exist).
- Only 9 modules have a `README.md`, and connectivity's is already stale.
- No formatter until now.
