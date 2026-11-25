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

- File names: `PascalCase.<role>.ts`, named after the **folder** (`src/profile/Profile.service.ts` → `ProfileService`, `createProfileController`), even when the URL prefix differs (`/pfp`). Shared helpers: `XyzUtilities.ts`.
- DB row types stay in `src/models/databases/` (`ITB_*`), because migrations and several modules share them.

## 3. Controllers
- Factory: `export default function createXyzController(db: KnexSqlUtilities): Router`. Take **only what the controller uses**: no unused `db` / `_db` (e.g. `createDebugController()`).
- Every handler is wrapped in `route(label, fallback, handler)` from `utils/requestUtils.ts`. Never write `new ControllerResponse` + try/catch + `handleException` by hand.
  ```ts
  router.get("/", route("XyzController.GET /", "Failed to load xyz", async (req, cr) => cr.ok<XyzDto[]>(await svc.list(req.logContext))));
  ```
- `label` = `"<Module>Controller.<METHOD> <path>"`. `fallback` = the short client-facing 500 message.
- Success is always `cr.ok<XyzDto>(data)`: **always pass the type argument** so the route shows what it returns (the compiler checks the value against it). Use `cr.ok<void>` / a small inline DTO such as `{ deleted: true }` → `DeletedDto` for acknowledgements.
- Errors: throw a typed exception via the registry (`throw new Exceptions.NotFound("...")`) (from the service, or from the controller for request-shape problems). `route()` maps it to the right status. Don't call `cr.result(...)` / `cr.badRequest(...)` inline. (Only exception: endpoints whose job is to answer with an arbitrary status, like `/debug/status/:code`.)
- Role checks use `requireRole(req, ...roles)` (throws `ForbiddenAccessException`), not `if (!hasRole(...)) return cr.result(403, ...)`.
- Every error body has the same shape: `data = { code, message, fieldName, typeOfError, timestamp }`. When converting an inline error, check fndom for readers of `data` as a string and switch them to `data.message`.
- Auth goes on the mount in `index.ts` (`mw.auth`), not repeated per route (`router.get(path, MandatoryTokenFilter, ...)`), unless only some routes of a router need it.
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
- When the same query appears in several methods, put it in one private helper (`activeTasks`, `loadOrThrow`).
- A service with no state or dependencies is a set of exported functions (e.g. `signToken`, `verifyToken`), not a class you have to `new` up.
- One concern = one owner: a setting used by several modules (e.g. JWT algorithm/TTL) is exported from the module that owns it and imported everywhere else, never duplicated with a "keep in sync" comment.
- Throw typed exceptions; never return error strings or `""` as failure.
- Don't wrap a method body in `try { ... } catch { throw new Exceptions.Unknown() }`: it hides the real cause from the request tree. Let errors propagate; `route()` turns them into a 500 and logs them.
- Never return DB rows to the client (not even "redacted"). Return a DTO with just the fields the client needs; for writes, the new value or `{ updated: true }`.
- Look up the current user by `getUser(req).id`, not by rebuilding `username_system` strings.

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
- Request validation uses our own hand-written `<Module>.validator.ts` (no zod or other schema libraries).
- Validators throw `InvalidRequestException(field, "mandatory" | "format")` and return the typed `XyzBody`.

## 5. Constants and magic values
- No magic strings or numbers inside logic. Name them as module-level `const`s at the top of the file.
- Table-name constants are named after the table, never a bare `TABLE`: `const SS_API_KEY_TABLE = "tb_ss_api_key";`, `const GEOCODE_CACHE_TABLE = "tb_geocode_cache";`.
- Naming: single values are `UPPER_SNAKE_CASE` (`JWT_TTL_MS`); enum-like `as const` objects are `PascalCase` with UPPER keys (`RecordStatus.ACTIVE`, `ResponseStatus.OK`, `Time.DAY_MS`).
- A value used by more than one module goes in `src/constants/`.
- Durations use `Time` from `src/constants/Time.ts`, with the unit in the name: `const OTP_TTL_MS = 15 * Time.MINUTE_MS;`.
- Shared constants (see `src/constants/README.md`): `RecordStatus` (never a raw `"A"`/`"D"`, in raw SQL pass it as a binding), `Time`, `APP_TIMEZONE`, `DEFAULT_CURRENCY`, `LogEmoji`.
- Hash secrets with `sha256Hex()` from `src/utils/HashUtilities.ts`; never inline `crypto.createHash("sha256")…`.
- Build query strings with `URLSearchParams`, not string concatenation, and name limits like `NOMINATIM_RESULT_LIMIT`.
- Values that differ per environment come from `process.env`, read in one place, with a documented default.
- Env vars loaded by dotenv (secrets, URLs) must be read **lazily** inside a function (`getJwtSecret()`), never in a top-level `const`: ESM evaluates imports before `index.ts` runs `dotenv.config`. Required ones are checked once at boot in `index.ts`.
- Environment checks use `APP_ENV` / `IS_PRD` / `IS_DEV` from `src/config/env.ts`. Never compare `process.env.NODE_ENV` inline or keep a local `isPrd` copy.
- Name HTTP status thresholds and limits (`MIN_STATUS = 200`), even when the meaning seems obvious.

## 6. HTTP conventions
- Envelope: `{ code, status: "Ok" | "Ko", data }`, produced only by `ControllerResponse`.
- URL segments use hyphens (`/card-label`, not `/card_label`).
- Mutations are always `POST` (`/:id/delete`, `/:id/update`); no `DELETE`/`PUT`/`PATCH` routes. Bodyless POSTs from clients send `{}`. Changing a verb is a frontend change: update fndom (`ApiRoute` + store) on the fndom branch `refactor/qindom-alignment`.

## 7. Database
- Soft delete via `record_status` `'A'`/`'D'`; timestamps are ms epoch (`Date.now()`).
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
| 2026-11-25 | Prettier only (no ESLint); 120 cols, trailing commas `all` (smallest diff vs existing code). |

## Open questions
