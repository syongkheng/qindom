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
- Factory: `export default function createXyzController(db: KnexSqlUtilities): Router`.
- Every handler is wrapped in `route(label, fallback, handler)` from `utils/requestUtils.ts`. Never write `new ControllerResponse` + try/catch + `handleException` by hand.
  ```ts
  router.get("/", route("XyzController.GET /", "Failed to load xyz", async (req, cr) => cr.ok(await svc.list(req.logContext))));
  ```
- `label` = `"<Module>Controller.<METHOD> <path>"`. `fallback` = the short client-facing 500 message.
- Success is always `cr.ok(data)`.
- Errors: throw a typed `BaseExceptions` subclass (from the service, or from the controller for request-shape problems). `route()` maps it to the right status. Don't call `cr.result(403, "Forbidden", ...)` / `cr.badRequest(...)` inline. *(Being confirmed folder by folder.)*
- Controllers hold no business logic and no SQL.

## 4. Services
- Class `XyzService` built with `db: KnexSqlUtilities` (plus any other collaborators).
- Public methods return named `XyzDto` types from `<Module>.types.ts`, never anonymous inline object types.
- `logContext?: IRequestLogContext` is the **last** parameter; pass it to `KnexSqlUtilities` calls.
- Don't mark a method `async` unless it awaits something.
- Throw typed exceptions; never return error strings or `""` as failure.

## 5. Constants and magic values
- No magic strings or numbers inside logic. Name them as `UPPER_SNAKE_CASE` module-level `const`s at the top of the file.
- A value used by more than one module goes in `src/constants/`.
- Durations are written as expressions with units in the name: `const OTP_TTL_MS = 15 * 60 * 1000;`.
- Values that differ per environment come from `process.env`, read in one place, with a documented default.

## 6. HTTP conventions
- Envelope: `{ code, status: "Ok" | "Ko", data }`, produced only by `ControllerResponse`.
- URL segments use hyphens (`/card-label`, not `/card_label`).
- Mutations are `POST` (`/:id/delete`, `/:id/update`). Bodyless POSTs from clients send `{}`.

## 7. Database
- Soft delete via `record_status` `'A'`/`'D'`; timestamps are ms epoch (`Date.now()`).
- All raw SQL uses bindings.
- Never edit the logic of an already-applied migration; add a new one.

## 8. Documentation
- Module `README.md`: *(open question, see log)*.
- Keep `MINDMAP.md` in step with structural changes.

---

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-25 | Shared `route()` wrapper replaces per-handler try/catch boilerplate. |
| 2026-11-25 | `/connectivity` health check pings the DB (`SELECT 1`); `data.status: "ok"` is kept because `deploy.sh` greps it. |
| 2026-11-25 | `XyzDto` / `XyzBody` types are co-located per module in `<Module>.types.ts` (replaces central `models/dtos`, `models/requests`). |
| 2026-11-25 | Prettier only (no ESLint); 120 cols, trailing commas `all` (smallest diff vs existing code). |

## Open questions
- Module READMEs: keep and maintain them, or drop them in favour of MINDMAP + types?
- Request validation: hand-written validators vs zod (analytics/pdca/mcp already use zod)?
