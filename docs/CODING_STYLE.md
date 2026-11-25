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
| `<Module>.validator.ts` | Request-body validation (optional) |
| `<Module>.types.ts` | `XyzDto` (responses) and `XyzBody` (request bodies) for this module |
| `<Module>.constants.ts` | Module constants, only when there are too many to keep at the top of the file using them |
| `<Module>.test.ts` | `node:test` unit tests |

- File names: `PascalCase.<role>.ts`. Shared helpers: `XyzUtilities.ts`.
- DB row types stay in `src/models/databases/` (`ITB_*`), because migrations and several modules share them.

## 3. Controllers
- Factory: `export default function createXyzController(db: KnexSqlUtilities): Router`. Take **only what the controller uses**: no unused `db` / `_db` (e.g. `createDebugController()`).
- Every handler is wrapped in `route(label, fallback, handler)` from `utils/requestUtils.ts`. Never write `new ControllerResponse` + try/catch + `handleException` by hand.
  ```ts
  router.get("/", route("XyzController.GET /", "Failed to load xyz", async (req, cr) => cr.ok<XyzDto[]>(await svc.list(req.logContext))));
  ```
- `label` = `"<Module>Controller.<METHOD> <path>"`. `fallback` = the short client-facing 500 message.
- Success is always `cr.ok<XyzDto>(data)`: **always pass the type argument** so the route shows what it returns (the compiler checks the value against it). Use `cr.ok<void>` / a small inline DTO such as `{ deleted: true }` → `DeletedDto` for acknowledgements.
- Errors: throw a typed `BaseExceptions` subclass (from the service, or from the controller for request-shape problems). `route()` maps it to the right status. Don't call `cr.result(...)` / `cr.badRequest(...)` inline. (Only exception: endpoints whose job is to answer with an arbitrary status, like `/debug/status/:code`.)
- Role checks use `requireRole(req, ...roles)` (throws `ForbiddenAccessException`), not `if (!hasRole(...)) return cr.result(403, ...)`.
- Every error body has the same shape: `data = { code, message, fieldName, typeOfError, timestamp }`. When converting an inline error, check fndom for readers of `data` as a string and switch them to `data.message`.
- Controllers hold no business logic and no SQL.

## 4. Services
- Class `XyzService` built with `db: KnexSqlUtilities` (plus any other collaborators).
- Public methods return named `XyzDto` types from `<Module>.types.ts`, never anonymous inline object types.
- `logContext?: IRequestLogContext` is the **last** parameter; pass it to `KnexSqlUtilities` calls.

## 4b. Logging
- `req.logContext` is always set (every route preset starts with `RestRequestLogger`). Don't guard it: write `LoggingUtilities.request.branch(req.logContext, ...)`, not `if (req.logContext)` or `logContext ? ... : undefined`.
- Don't mark a method `async` unless it awaits something.
- A service with no state or dependencies is a set of exported functions (e.g. `signToken`, `verifyToken`), not a class you have to `new` up.
- One concern = one owner: a setting used by several modules (e.g. JWT algorithm/TTL) is exported from the module that owns it and imported everywhere else, never duplicated with a "keep in sync" comment.
- Throw typed exceptions; never return error strings or `""` as failure.

## 4a. Validation
- Request validation uses our own hand-written `<Module>.validator.ts` (no zod or other schema libraries).
- Validators throw `InvalidRequestException(field, "mandatory" | "format")` and return the typed `XyzBody`.

## 5. Constants and magic values
- No magic strings or numbers inside logic. Name them as module-level `const`s at the top of the file.
- Naming: single values are `UPPER_SNAKE_CASE` (`JWT_TTL_MS`); enum-like `as const` objects are `PascalCase` with UPPER keys (`RecordStatus.ACTIVE`, `ResponseStatus.OK`, `Time.DAY_MS`).
- A value used by more than one module goes in `src/constants/`.
- Durations use `Time` from `src/constants/Time.ts`, with the unit in the name: `const OTP_TTL_MS = 15 * Time.MINUTE_MS;`.
- Shared constants (see `src/constants/README.md`): `RecordStatus` (never a raw `"A"`/`"D"`, in raw SQL pass it as a binding), `Time`, `APP_TIMEZONE`, `DEFAULT_CURRENCY`, `LogEmoji`.
- Values that differ per environment come from `process.env`, read in one place, with a documented default.
- Env vars loaded by dotenv (secrets, URLs) must be read **lazily** inside a function (`getJwtSecret()`), never in a top-level `const`: ESM evaluates imports before `index.ts` runs `dotenv.config`. Required ones are checked once at boot in `index.ts`.
- Environment checks use `APP_ENV` / `IS_PRD` / `IS_DEV` from `src/config/env.ts`. Never compare `process.env.NODE_ENV` inline or keep a local `isPrd` copy.
- Name HTTP status thresholds and limits (`MIN_STATUS = 200`), even when the meaning seems obvious.

## 6. HTTP conventions
- Envelope: `{ code, status: "Ok" | "Ko", data }`, produced only by `ControllerResponse`.
- URL segments use hyphens (`/card-label`, not `/card_label`).
- Mutations are `POST` (`/:id/delete`, `/:id/update`). Bodyless POSTs from clients send `{}`.

## 7. Database
- Soft delete via `record_status` `'A'`/`'D'`; timestamps are ms epoch (`Date.now()`).
- All raw SQL uses bindings.
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
| 2026-11-25 | Prettier only (no ESLint); 120 cols, trailing commas `all` (smallest diff vs existing code). |

## Open questions
