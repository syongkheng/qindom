# Refactor checklist

Branch: `refactor/codebase-cleanup`. One commit per folder. Folders 1–15 were reviewed with the user; from 16 on, a `folder-refactorer` agent (`~/.claude/agents/folder-refactorer.md`) does each folder and the orchestrating session reviews, verifies and commits it, asking the user only when unsure. Rules: [CODING_STYLE.md](./CODING_STYLE.md).

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
| 15 | `pdca` | [x] | b756d3f | zod → `PdcaEnquiry.validator.ts`; `PdcaEnquiry.ts` → `.service.ts` (+ `PdcaEnquiryService.submit`, sending moved out of controller); `.types.ts`; log-scrub middleware → `.middleware.ts`; Origin now required (`isEnquiryOriginAllowed`); lab contact details + timezone named; `route()`; tests ported + send-flow tests; README |
| 16 | `lta` | [x] | f7be3a5 | LTA SQL moved from `KnexSqlUtilities` (`db.lta`/`db.pphs` gone) into `LtaService` (hdb calls it, shape unchanged; MRT swapped-column POINT documented); `POST /bus/services` → `GET ?busStopCode=` + camelCase `{ services, count }` (fndom cards); `/timing` typed pass-through `{ records }` (unused `source` dropped); `statistics` → `getBusArrivals` (DataMall failure = 502, was swallowed → 500), URLSearchParams, lazy key, no dotenv; ~170 lines dead code; one validator fn; `route()`; `Lta.types.ts`; `db.raw` takes a log event; tests + README |
| 17 | `tgimage` | [x] | f7fa44b | `route()` ×4 (GET buffered + re-encoded before any header, so no stream crash; headers unchanged) + typed DTOs; `requireRole(OWNER)`; inline 400s → `TgImage.validator.ts` (file, image/* only, column caps, positive-int `telegramUserId`); admin list camelCase (fndom); storage-chat sentence-`InvalidRequest` → `Unknown`; Telegram failures → 502; lazy token; `RecordStatus` + named constants; logContext; `TgLog.bot` → `TgImage.bot` (handlers catch, /list HTML-escaped); caption IP from X-Real-IP; tests + README |
| 18 | `budget` | [x] | 4dbf824 | `route()` ×11 + typed DTOs (no `any`); `Budget.types.ts` (+ `BudgetTemplate`/`BudgetItemStatus` enums, row types import them); static validator → functions w/ column caps (name 255, category 64, notes 1024, email 255, DECIMAL(12,2) amounts), empty item update → 400 (was a knex 500), `:userId` → 400 when not a positive int; `RecordStatus` (incl. raw-SQL binding); logContext through every query; shared `loadTable`/`loadOwnedTable`/`loadItem`; item writes scoped by `table_id`; list sums in one query (was N+1); access semantics unchanged; tests (access matrix + in-process HTTP) + README (none before); paths → `/:sessionId/update|delete`, `/item/:itemId/update` (fndom); create accepts `null` amounts; fndom category clear now sends `null` |
| 19 | `siri-shortcut` | [~] in review | | `route()` ×4 + `cr.ok<Dto>` (reuses `ApplePayTransactionDto`/`TodoWidgetDto`; `SiriShortcutSmsConfirmationDto`); inline V1 checks + `$` strip and V2 parsing → `SiriShortcut.validator.ts` + pure `ApplePaySms.parser.ts` (named, per-bank regexes); Citi merchant regex rewritten ("by"+2,000 spaces blocked the event loop ~4 s) + `smsBody` ≤2000; merchant/name ≤255 and amount within DECIMAL(10,2) → 400 (were DB errors); no logContext guards; request/response shapes unchanged (phone contract); `GET /v1/ss/ap/transaction` has no frontend caller (kept); tests (parsers, validators, in-process HTTP for all 4 routes) + README (none before) |
| 20 | `hdb` | [ ] | | |
| 21 | `mcp` | [x] removed | | `/mcp`, `/mcp-key`, `mcpLimiter`, `mw.mcpPublic`, `mcp` key prefix, `@modelcontextprotocol/sdk` removed; migration 20261126000000 drops `tb_mcp_api_key` |
| 22 | `wedding` | [ ] | | uses raw `res.status` |
| 23 | `itinerary` | [ ] | | file inserts (`_filesToInsert`) don't validate `tgShortCode` ownership or `mimeType` (moved here from `file`) |
| 24 | `auth` | [ ] | | Auth.service still parses roles by hand ×2 → `parseRoles`; `AuthValidator` static class (only `validateUsername` is a function so far); inline `cr.result(403, ...)` |
| 25 | `camera` | [ ] | | |
| 26 | `analytics` | [ ] | | replace zod (3 files; last users); then `npm uninstall zod`; `isOriginAllowed` lets a missing Origin through (deliberate for /collect? pdca now has its own stricter check) |
| 27 | `middlewares` | [ ] | | `RequestApiKeyFilter` ignores the key owner's `record_status` (deleted user's key still works) and puts the raw `apiKey` in `logContext.metadata` (check redaction); CORS rejection answers `{status:"Forbidden", data:"CORS: origin … not allowed"}` (not the registry error shape); `ApiKeyFilter` passes a sentence to `InvalidRequest` (code `invalid_request_Invalid API key`); `TokenOrApiKeyFilter.ts` unused (delete needs OK) |
| 28 | `utils` + `utils/logging` | [ ] | | importing modules in tests prints `[dotenv] injecting env from .env` (some util loads dotenv); `KnexSqlUtilities.transaction` hands out a raw knex trx (todo reorder can't log its N updates);  `KnexSqlUtilities.raw` takes no log event (raw SQL never appears in the request tree);  `KnexSqlUtilities.findOne` names its param `logContext` but it's an `IRequestLogEvent`;  `LoggingUtilities` imports dotenv (why?); rename `requestUtils.ts`, `errorUtils.ts`, typo `StructualValidationUtilities.ts`; move LTA SQL out of `KnexSqlUtilities` |
| 29 | `models` | [ ] | | move `IDecodedTokenUser` → `token/Token.types.ts`; move DTO/Body types into modules; `BaseEntity.throwIfInvalid` throws plain `Error` |
| 30 | `config/db`, `index.ts`, `migrate.ts` | [ ] | | index.ts still compares `NODE_ENV` inline → `config/env.ts` | |
| 31 | `migrations` | [ ] | | format only, never change logic |
| 32 | empty folders `src/log`, `src/places` | [ ] | | delete only on explicit OK |

## fndom companion branch
`refactor/qindom-alignment` (unpushed): MCP key UI removed; ss-key revoke → `POST /ss-key/api-key/delete`; unused `ApiRoute.FILE.CREATE_TG` removed; suggestion panels → camelCase + delete routes → POST. lta bus services → GET + camelCase. tg image admin list → camelCase. budget rename/delete/item-update paths → `/:id/update|delete`; budget category clear sends `null`. **Deploy fndom together with qindom.**

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

## Open questions for the user (collected during autonomous run)
Design/security decisions the refactor deliberately left unchanged. To be decided together at the end.

**budget**
- B1. `POST /budget/:id/collaborator` tells any table owner whether an email has an account (404 vs 200): email enumeration, only global rate limits.
- B2. Invitees don't need a verified email (`email_verified` not checked).
- B3. Every collaborator sees the other collaborators' emails in `GET /budget/:id`.
- B4. Collaborators whose user account is soft-deleted still appear and keep their collaborator row.
- B5. Collaborators can't leave a shared table themselves (only the owner can remove them).

**siri-shortcut** (consumer = your iPhone Shortcuts; contract frozen)
- S1. V1 tap accepts blank `merchant`/`name` (stored `""`) and blank `amount` (stored as 0). Reject as 400, or keep lenient so a tap is never dropped?
- S2. V1 rejects amounts with thousands separators (`"$1,234.50"` → 400), so taps ≥ 1,000 may never be recorded depending on Shortcut formatting. Strip commas?
- S3. V1 accepts negative amounts. Keep?
- S4. (kept) `smsBody` now capped at 2000 chars (real alerts ~250; 10-part SMS ~1,530).
