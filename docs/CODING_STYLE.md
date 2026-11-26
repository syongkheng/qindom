# qindom: Coding Style

The source of truth for how code in this repo should look. It is a living document: when a new preference is agreed, add the rule here and log it in the [Decisions log](#decisions-log).

The guiding goal is **low maintenance cost**. Prefer one obvious way to do each thing over clever local variations.

---

## 1. Formatting
- **Prettier** owns formatting (`.prettierrc.json`: 120 cols, 2 spaces, double quotes, semicolons, trailing commas everywhere).
- Run `npm run format` before committing; `npm run format:check` must pass. Don't hand-format against it.

## 2. Module layout
Each feature folder `src/<module>/` holds:

| File | Role |
|---|---|
| `<Module>.controller.ts` | HTTP only: parse params, call the service, `cr.ok(...)` |
| `<Module>.service.ts` | Business logic + DB access via `KnexSqlUtilities` |
| `<Module>.validator.ts` | Request-body validation: exported functions `validateXyzBody(body, event?) → XyzBody` (no static classes) |
| `<Module>.types.ts` | `XyzDto` (responses) and `XyzBody` (request bodies) for this module |
| `<Module>.constants.ts` | Module constants, only when there are too many to keep at the top of the file using them |
| `<Module>.test.ts` | `node:test` unit tests |

- A folder with several features prefixes each with the folder name (`house/HouseLayout.service.ts`, `house/HouseShare.service.ts`) and shares one `<Folder>.types.ts` / `<Folder>.validator.ts`.
- File names: `PascalCase.<role>.ts`, named after the **folder** (`src/profile/Profile.service.ts` → `ProfileService`, `createProfileController`), even when the URL prefix differs (`/pfp`). Shared helpers: `XyzUtilities.ts`.
- DB row types stay in `src/models/databases/`: file `tb_<table>.ts` exporting one `ITB_<TABLE>`; NULL columns `| null`; `?` only for columns an insert may omit; BIGINT ms `number`; delete the type when its table is dropped (enforced by `Models.test.ts`).
- No `RequestWithXyz` interfaces: request extensions go in the global augmentation (`src/types/express/index.d.ts`); handlers take plain `Request`.
- Non-standard `record_status` values (tgimage's `"I"`) are exported constants in the owning module's types.
- A service lives in the module that **owns its tables**. Other modules (e.g. `siri-shortcut` ingestion routes) import it from there; they never host it.

## 3. Controllers
- Factory: `export default function createXyzController(db: KnexSqlUtilities): Router`. Take **only what the controller uses**: no unused `db` / `_db` (e.g. `createDebugController()`).
- Every handler is wrapped in `route(label, fallback, handler)` from `utils/RequestUtilities.ts`. Never write `new ControllerResponse` + try/catch + `handleException` by hand.
  ```ts
  router.get("/", route("XyzController.GET /", "Failed to load xyz", async (req, cr) => cr.ok<XyzDto[]>(await svc.list(req.logContext))));
  ```
- `label` = `"<Module>Controller.<METHOD> <path>"`. `fallback` = the short client-facing 500 message.
- Success is always `cr.ok<XyzDto>(data)`: **always pass the type argument** so the route shows what it returns (the compiler checks the value against it). Use `cr.ok<void>` / a small inline DTO such as `{ deleted: true }` → `DeletedDto` for acknowledgements.
- Errors: throw a typed exception via the registry (`throw new Exceptions.NotFound("...")`) (from the service, or from the controller for request-shape problems). `route()` maps it to the right status. Don't call `cr.result(...)` / `cr.badRequest(...)` inline. (Only exceptions: endpoints whose job is to answer with an arbitrary status, like `/debug/status/:code`, and error bodies fixed by an external contract, like `/analytics/report`'s `{message, problems}`, with a comment.)
- Role checks use `requireRole(req, ...roles)` (throws `ForbiddenAccessException`), not `if (!hasRole(...)) return cr.result(403, ...)`.
- Every error body has the same shape: `data = { code, message, fieldName, typeOfError, timestamp }`. When converting an inline error, check fndom for readers of `data` as a string and switch them to `data.message`.
- Middlewares signal request errors by throwing `Exceptions.X` (answered by `ErrorHandler`), not inline `cr.result`, except client-contract bodies (TokenFilter `token_invalid`/`csrf_invalid`, the API-key 401), which carry a comment.
- Client IPs for display/storage always come from `clientIp(req)` (`utils/requestUtils`); limiter keys use their own IPv6-collapsed key.
- `logContext.metadata` holds only what code reads (e.g. `userId`); never secrets.
- Rate limiters are built with the `limiter({...})` factory in `RateLimiter.ts`, windows via `Time`; route-group middleware chains live only in `presets.ts` (`mw.*`).
- Auth goes on the mount in `index.ts` (`mw.auth`), not repeated per route (`router.get(path, MandatoryTokenFilter, ...)`), unless only some routes of a router need it.
- Binary/raw responses use `route(label, fallback, async (req, _cr, res) => …)`: finish every lookup and upstream call **before** the first `setHeader` so failures still get the JSON error; send with `res.end(buffer)`.
- Controllers hold no business logic and no SQL. Request-body checks go in the module's validator, not inline `V.required(...)` calls in the handler.
- Dead routes (no fndom/jessikheng/Shortcut caller) are deleted, not refactored. Confirm by grepping the frontends first, and ask before deleting.

## 4. Services
- Class `XyzService` built with `db: KnexSqlUtilities` (plus any other collaborators).
- Public methods return named `XyzDto` types from `<Module>.types.ts`, never anonymous inline object types. For third-party payloads we pass through (e.g. Nominatim), type the fields we or fndom read and add `[field: string]: unknown`.
- `logContext?: IRequestLogContext` is the **last** parameter; pass it to `KnexSqlUtilities` calls.

## 4b. Logging
- `req.logContext` is always set (every route preset starts with `RestRequestLogger`). Don't guard it: write `LoggingUtilities.request.branch(req.logContext, ...)`, not `if (req.logContext)` or `logContext ? ... : undefined`.
- Services: public methods take `logContext?: IRequestLogContext` as the last parameter (optional, because some run outside a request). Open one event per method and pass it to every `KnexSqlUtilities` call so SQL timings land in the request tree:
  ```ts
  const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Geocode search"); // undefined when no context
  await this.db.find(TABLE, where, options, event);
  if (event) event.detail = "cache hit";
  ```
  `branch()` accepts an undefined context and returns undefined, so no guard is needed to create it. Private helpers take `event?: IRequestLogEvent`.
- Request-scoped outcomes (cache hit/miss, counts) go in the event's `detail`, not in extra `LoggingUtilities.service.info` lines. Keep `service.*` for things worth seeing in PM2 logs (external calls, failures).
- Don't mark a method `async` unless it awaits something.
- No `any` in service signatures (`Promise<any>`, `any[]`). Map DB rows to DTOs with a `toXyzDto(row)` function.
- Sort in SQL (`orderBy`) rather than in JS unless the sort key needs a fallback the query options can't express.
- `SELECT` only the columns a method needs (`["id"]` for existence checks, a `SUMMARY_COLUMNS` list for summaries).
- When the same query appears in several methods, put it in one private helper (`activeTasks`, `loadOrThrow`).
- A service with no state or dependencies is a set of exported functions (e.g. `signToken`, `verifyToken`), not a class you have to `new` up.
- One concern = one owner: a setting used by several modules (e.g. JWT algorithm/TTL) is exported from the module that owns it and imported everywhere else, never duplicated with a "keep in sync" comment.
- Throw typed exceptions; never return error strings or `""` as failure.
- Don't wrap a method body in `try { ... } catch { throw new Exceptions.Unknown() }`: it hides the real cause from the request tree. Let errors propagate; `route()` turns them into a 500 and logs them.
- Never return DB rows to the client (not even "redacted"). Return a DTO with just the fields the client needs; for writes, the new value or `{ updated: true }`.
- Look up the current user by `getUser(req).id` (JWT routes) or `getApiKeyUserId(req)` (x-api-key routes), never `logContext.metadata.userId as number` or rebuilt `username_system` strings.
- More than ~3 positional parameters of the same kind → pass an input object (`recordSmsTransaction(userId, { amount, currency, merchant, cardLast4 })`).
- Numeric path params go through a `validateXyzParam` function; never pass `Number(req.params.x)` straight to SQL.
- Numeric columns are range-checked against their DECIMAL width, like text against VARCHAR.
- Child aggregates for N parents: one `whereIn` query grouped in JS, not one query per parent.
- Fixed sets of stored string values get an enum-like constant + type (`TransactionSource.V2`), not bare `"v2"`. It lives in the module's `<Module>.types.ts`; the `ITB_*` row type imports it (`import type`) instead of repeating the union.
- Text length limits count code points (`charLength` / `V.*`); never compare `.length` against a VARCHAR width.
- All Telegram Bot API sends go through `sendTelegramHtml` / `getTelegramBotToken` (`utils/TelegramUtilities.ts`). A new Express mount needs a `TelegramLogModules` entry (test-enforced).
- Wrapped errors keep the original on `cause` (`Object.assign(new Error(msg), { cause })`).
- Use `V.requiredText(value, field, max)` / `V.optionalText(value, field, max)` for strings (trim + length cap + blank→null); don't hand-roll trim/length checks.
- API JSON is **camelCase** everywhere; snake_case column names never reach the client.
- Free-text fields are length-checked against their column in the validator (and the column width noted in a comment), so an oversized value is a 400, never a DB error/truncation.

## 4c. Exceptions
- **Every exception must be in the `Exceptions` registry.** No exception class may exist outside it:
  - Every class lives in `src/exceptions/AppExceptions.ts` and has a registry entry. Never define an exception class in a module, and never extend `BaseException` elsewhere.
  - Code throws only through the registry (`throw new Exceptions.X(...)`). Never import a class directly; the only direct import allowed is `BaseException`, for `instanceof`.
  - Don't throw a plain `new Error(...)` for anything a client should see; it becomes a generic 500. Plain `Error` is only for startup/config failures and internal "should never happen" bugs.
  - Enforced by `AppExceptions.test.ts`: it fails if any exported `BaseException` subclass is missing from the registry.
- Every exception states its HTTP status explicitly and the status must match the meaning: 4xx for the caller's fault, 5xx for ours, 502 for a failing upstream service.
- `InvalidRequest(field, "mandatory" | "format" | "limit")` takes a **field name**, never a sentence (`"limit"` = a per-user cap was hit, e.g. `InvalidRequest("pinned", "limit")`). Use `NotFound(message)`, `ForbiddenAccess(message)`, `UnauthorizedAccess(message)` for custom text.
- `code` and class names are a frontend contract (fndom maps `data.code` to translations). Check fndom before renaming either.
- Need a new error kind? Add a class + registry entry in `AppExceptions.ts` and a row in `src/exceptions/README.md`.

## 4a. Validation
- When replacing a validator or library, first write a characterisation table against the old implementation, keep it as the regression test, and (if cheap) run a differential fuzz.
- Request validation uses our own hand-written `<Module>.validator.ts` (no zod or other schema libraries). zod was fully removed in Nov 2026.
- Role suffixes beyond controller/service/validator/types/test are fine when a file has one clear job (e.g. `PdcaEnquiry.middleware.ts`).
- Validators throw `InvalidRequestException(field, "mandatory" | "format")` and return the typed `XyzBody`.

## 5. Constants and magic values
- No magic strings or numbers inside logic. Name them as module-level `const`s at the top of the file.
- Table-name constants are named after the table, never a bare `TABLE`: `const SS_API_KEY_TABLE = "tb_ss_api_key";`, `const GEOCODE_CACHE_TABLE = "tb_geocode_cache";`.
- Naming: single values are `UPPER_SNAKE_CASE` (`JWT_TTL_MS`); enum-like `as const` objects are `PascalCase` with UPPER keys (`RecordStatus.ACTIVE`, `ResponseStatus.OK`, `Time.DAY_MS`).
- A value used by more than one module goes in `src/constants/`.
- Durations use `Time` from `src/constants/Time.ts`, with the unit in the name: `const OTP_TTL_MS = 15 * Time.MINUTE_MS;`.
- Shared constants (see `src/constants/README.md`): `RecordStatus` (never a raw `"A"`/`"D"`, in raw SQL pass it as a binding), `Time`, `APP_TIMEZONE`, `DEFAULT_CURRENCY`, `LogEmoji`.
- Hash secrets with `sha256Hex()` from `src/utils/HashUtilities.ts`; never inline `crypto.createHash("sha256")…`.
- Never pipe untrusted data through a transform stream without error handling. Prefer buffering (`sharp(buf).toBuffer()`), so a bad input can't crash the process.
- Callbacks the framework doesn't await (bot `onText`, emitters, WebSocket `message`/`close`/`error`, timers) must catch and log their promise.
- WebSocket upgrades: wrap the `upgrade` listener body in try/catch; start async handlers with `.catch(...)`, never `void promise`; the `handleUpgrade` callback closes the socket with 1011 on error instead of writing an HTTP response.
- `new URL(req.url)` outside Express must be wrapped: it throws on inputs like `//`.
- Socket size limits are checked on byte length before decoding to a string.
- User text inserted into HTML (emails, Telegram `parse_mode: "HTML"`) is always escaped. HTML template helpers take plain text and escape it themselves; callers never pass pre-escaped strings (except an explicit `bodyHtml`).
- Email content comes from pure `xyzMail(...) → MailOptions` builders, so tests can check escaping/recipients without SMTP.
- Services that use randomness take the source as an injectable constructor argument with the real default. Env-dependent security switches (dev OTP bypass) are injectable options defaulting to `IS_DEV`, tested in both states.
- Session-creating services return `{ token, session }`; the controller sets the cookie and sends only `session`.
- Constant-answer anti-enumeration endpoints catch inside `route()` and log to the request tree; never swallow silently.
- Test fakes honour `columns`, so a missing SELECT column fails the test.
- Don't mount a token filter on routes that never read `req.user` (it costs a DB lookup and can 403 on CSRF).
- Regexes on untrusted text: no two adjacent sub-patterns may match the same characters (e.g. `([\s\S]+?)\s+` backtracks catastrophically); anchor captures on `\S`. Cap the text length in the validator even if it isn't stored.
- Free-form input parsing (SMS, scraped text) lives in a pure `<Feature>.parser.ts` returning null for missing parts; the validator decides which gaps are 400s.
- When two modules check the same column, the owning module exports the limit (`MAX_AMOUNT`, `MERCHANT_MAX_LENGTH`).
- Third-party calls: any failure (network error, non-OK status, unreadable body) → `Exceptions.ExternalRequest` (502); missing server config (API key) → `Unknown` (500) with a server log.
- Every Nominatim call goes through geocode's `searchNominatim` (one shared 1 req/s queue + UA); no second client.
- Coordinates in query strings are validated as plain decimals (`/^-?\d+(\.\d+)?$/`) and range-checked (±90 / ±180).
- Logic duplicated across repos on purpose (e.g. PPHS batch rule in qindom + fndom) carries a comment in both places pointing at the other.
- Build query strings with `URLSearchParams`, not string concatenation, and name limits like `NOMINATIM_RESULT_LIMIT`.
- Values that differ per environment come from `process.env`, read in one place, with a documented default.
- Env vars loaded by dotenv (secrets, URLs) must be read **lazily** inside a function (`getJwtSecret()`), never in a top-level `const`: ESM evaluates imports before `index.ts` runs `dotenv.config`. Required ones are checked once at boot in `index.ts`.
- Environment checks use `APP_ENV` / `IS_PRD` / `IS_DEV` from `src/config/env.ts`. Never compare `process.env.NODE_ENV` inline or keep a local `isPrd` copy.
- Name HTTP status thresholds and limits (`MIN_STATUS = 200`), even when the meaning seems obvious.

## 6. HTTP conventions
- Envelope: `{ code, status: "Ok" | "Ko", data }`, produced only by `ControllerResponse`.
- URL segments use hyphens (`/card-label`, not `/card_label`).
- Exception to "reads are GET": a read that checks a secret or session state, or triggers outbound calls, may stay `POST` so the CSRF check applies (`/auth/verification`, `/hdb/pphs/geocode-options`). Note why in the README.
- Mutations are always `POST` (`/:id/delete`, `/:id/update`); no `DELETE`/`PUT`/`PATCH` routes. Bodyless POSTs from clients send `{}`. Changing a verb is a frontend change: update fndom (`ApiRoute` + store) on the fndom branch `refactor/qindom-alignment`.

## 7. Database
- Soft delete via `record_status` `'A'`/`'D'`; timestamps are ms epoch (`Date.now()`).
- Module SQL never lives in `KnexSqlUtilities`; it goes in the service that owns the table, and other modules call that service (e.g. hdb → `LtaService`).
- Raw SQL goes through `this.db.raw(sql, bindings, event)` so it's timed in the request tree.
- Typed exceptions thrown inside `db.transaction` keep their status. Still check ownership before opening it when you can (so nothing is written). Inside the callback use `tx.*(…, event)` (the `KnexSqlUtilities` bound to the trx) rather than the raw `trx`, and pass `event` as `transaction`'s second argument.
- Client-addressed child rows: check every id (updates and delete lists) belongs to the parent before writing (→ 403), and still scope each child UPDATE/DELETE by the parent id.
- Validators for round-trip payloads (client posts back what the GET returned) accept the GET's own shapes (DECIMAL strings, 0/1 flags, digit-string ids).
- All raw SQL uses bindings, including status values (`SET record_status = ?` with `RecordStatus.DELETED`, never `'D'` inline).
- Responses that report a count (`deleted`, `updated`) return what the DB actually affected, not the input length.
- Never edit the logic of an already-applied migration; add a new one.

## 8. Documentation
- Every module has a `README.md` (endpoints, auth, request + response shapes). Update it in the same change as the code; create one when a module has none.
- Keep `MINDMAP.md` in step with structural changes.

---

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-25 | Shared `route()` wrapper replaces per-handler try/catch boilerplate. |
| 2026-11-25 | `/connectivity` health check pings the DB (`SELECT 1`); `data.status: "ok"` is kept because `deploy.sh` greps it. |
| 2026-11-25 | `XyzDto` / `XyzBody` types are co-located per module in `<Module>.types.ts` (replaces central `models/dtos`, `models/requests`). |
| 2026-11-25 | Module READMEs are kept and updated as each folder is refactored. |
| 2026-11-25 | No zod: validation is our own `<Module>.validator.ts`; zod is removed as a dependency. |
| 2026-11-25 | Controller errors are typed exceptions + `requireRole()`; one error shape everywhere. |
| 2026-11-25 | MCP feature to be removed (not needed), which lets zod go. |
| 2026-11-25 | Controllers show their response type with `cr.ok<XyzDto>(...)` (explicit type argument, every route). |
| 2026-11-25 | Shared env flags in `src/config/env.ts` (`APP_ENV`, `IS_PRD`, `IS_DEV`). |
| 2026-11-25 | No defensive `req.logContext` guards. |
| 2026-11-25 | Controller factories take only the dependencies they use. |
| 2026-11-25 | `requireRole(req, ...roles)` guard added to `requestUtils`. |
| 2026-11-25 | Stateless services are exported functions; shared settings have one owning module. |
| 2026-11-25 | dotenv-loaded env vars are read lazily; required ones checked at boot. |
| 2026-11-25 | `RecordStatus` constant replaces raw `'A'`/`'D'`; `Time` units; `APP_TIMEZONE` / `DEFAULT_CURRENCY`. |
| 2026-11-25 | Enum-like objects PascalCase (`RESPONSE_STATUS` → `ResponseStatus`), single values UPPER_SNAKE. |
| 2026-11-25 | Exceptions consolidated into `AppExceptions.ts`, used only via `Exceptions.X`; 4 unused deleted; `BaseExceptions` → `BaseException`. |
| 2026-11-25 | Status fixes: ExternalRequest 502, EntityCreation/Update 500, MaxVerifyAttempts 429, VerifyCodeExpired 400. |
| 2026-11-25 | All exceptions must be registered in `Exceptions`; no exception classes outside `AppExceptions.ts` (enforced by test). |
| 2026-11-25 | Service log pattern: `logContext?` last → one `branch()` event per method → passed to DB calls; `branch()` accepts undefined context. |
| 2026-11-25 | Pass-through external payloads get a DTO typing only the fields we/fndom read, plus an index signature. |
| 2026-11-25 | Validators are exported functions (`validateXyzBody`), not static classes. |
| 2026-11-25 | Mutations are always POST; `DELETE /ss-key/api-key` → `POST /ss-key/api-key/delete` (fndom updated). |
| 2026-11-25 | Shared `sha256Hex()` helper for all hashing. |
| 2026-11-25 | Table constants are descriptive (`SS_API_KEY_TABLE`), never a bare `TABLE`. |
| 2026-11-25 | Dead routes are deleted after confirming no frontend caller (`POST /file/tg` removed). |
| 2026-11-25 | Keep `_fileIdsToDelete` as the `/file/delete` body field (fndom contract). |
| 2026-11-25 | Files/classes named after their folder (`Pfp.*` → `Profile.*`). |
| 2026-11-25 | Never return DB rows; no try/catch→Unknown wrappers; user lookups by id; auth on the mount. |
| 2026-11-25 | Shared `parseRoles()` (auth/Permission) and `validateUsername()` (auth validator). |
| 2026-11-25 | `InvalidRequest` gains `"limit"` error type for per-user caps. |
| 2026-11-25 | No `any` in service signatures; `toXyzDto` mappers. |
| 2026-11-25 | Services live with the tables they own (`SsApplePayV1Service` → `applepay/ApplePayService`). |
| 2026-11-25 | `getApiKeyUserId(req)` for API-key routes; input objects over long positional lists; `TransactionSource` enum. |
| 2026-11-25 | Shared `V.requiredText` / `V.optionalText`. |
| 2026-11-25 | API JSON is camelCase; suggestion GETs converted (fndom updated). Admin suggestion writes kept, DELETE → POST. |
| 2026-11-25 | Multi-feature folders: `<Folder><Feature>.*` files + one shared `<Folder>.types.ts`/`.validator.ts`. |
| 2026-11-26 | User decision: dev must use `.env.dev`. `mysql.ts` loaded `.env` (prod) at import before index.ts's `.env.dev` override (ESM hoisting), so dev was using `.env`'s DB. Folder 30: env loaded by a first-imported `config/loadEnv.ts`, no dotenv in mysql.ts. `npm run migrate` keeps targeting `.env` deliberately. |
| 2026-11-26 | models: `models/dtos` + `models/requests` emptied (types moved to owners or deleted), `IDecodedTokenUser` → `token/Token.types.ts`, row types renamed `ITB_<TABLE>` + nullable/RecordStatus typing (test-enforced), 7 row types for never-created tables deleted. Questions D1–D3. |
| 2026-11-26 | utils: `requestUtils`/`errorUtils`/`Structual…` renamed to `*Utilities`; transactions keep typed exceptions and expose a logged `tx`; dotenv removed from utils; lazy mail transporter; Telegram transport moved to utils/logging with one shared sender; mute matrix covers every mount; code-point length caps. |
| 2026-11-26 | middlewares: 79 pinning tests before refactor (88 total); request-log flush in `finish` could crash the process (fixed); shared `clientIp`; raw API key no longer in log metadata; new registry `UnsupportedMediaType` (415); `mw.authUpload` / `mw.pdcaPublic` presets. Questions M1–M5. |
| 2026-11-26 | analytics: zod replaced by hand-written validators (176 characterisation cases + 180k-input differential, 0 diffs) and uninstalled; public contracts frozen; services own the SQL. Questions Y1–Y4. |
| 2026-11-26 | camera: unauthenticated `GET //` upgrade crashed the process (fixed + test); every WS callback guarded; sha256Hex; protocol/security unchanged. Questions C1–C4. |
| 2026-11-26 | auth: split into AuthRegistration/AuthSession/AuthAdmin services + AuthAdmin.controller; 31 pinning tests before refactor; no security semantics changed; dev OTP bypass via IS_DEV; fndom profile password-change error now toasts. Questions A1–A11. |
| 2026-11-26 | itinerary: paths → `/:id/update|delete`, dead `/add-collaborator` removed (fndom); service split (read/share vs save); foreign child ids of every type → 403 before the transaction (fixed a 500); file mimeType image/* + column caps; turning off the access code now persists (fndom); `challenge` redacted from logs. Questions I1–I4. |
| 2026-11-26 | wedding: house style; escaping centralised in templates; unused OptionalTokenFilter removed from all /wedding routes; jessikheng contract unchanged. Questions W1–W3. |
| 2026-11-26 | hdb: pphs list/busstops/mrt → GET + camelCase (fndom); scraping only for the current batch (latest even month, same rule as fndom); admin update upserts and builds formedUrl server-side; Nominatim via the shared queue. Questions H1–H3. |
| 2026-11-26 | siri-shortcut: Citi SMS regex ReDoS fixed (2 KB of spaces blocked the event loop ~4 s); smsBody ≤ 2000; contract unchanged. Questions S1–S4 collected. |
| 2026-11-26 | budget: paths → `/:id/update|delete`, `/:id/item/:itemId/update` (fndom); create accepts null amounts; fndom category clear fixed. Design questions B1–B5 collected for the user. |
| 2026-11-26 | tgimage: image fetch buffered (a non-image used to crash the process); uploads image/* only; bot `/list` escaped; caption IP from x-real-ip; admin list camelCase (fndom). |
| 2026-11-26 | No live server probes (they sent Telegram alerts); HTTP checks run in-process with fakes. |
| 2026-11-26 | lta: `POST /lta/bus/services` → GET; camelCase `{ services, count }` (fndom updated); LTA/geo SQL moved from KnexSqlUtilities to LtaService; `raw()` takes a log event. |
| 2026-11-26 | From folder 16 on, a `folder-refactorer` agent does each folder; the orchestrating session reviews and commits. |
| 2026-11-26 | pdca requires an Origin header (option A); analytics `/collect` stays lenient. |
| 2026-11-26 | pdca: zod → hand-written validator; mail-sending logic moved from controller to `PdcaEnquiryService`. |
| 2026-11-26 | File deletions needed by the refactor are pre-approved (still listed in summaries; `git mv` for renames). |
| 2026-11-25 | Prettier only (no ESLint); 120 cols, trailing commas `all` (smallest diff vs existing code). |

## Open questions
