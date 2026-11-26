## models

No routes. Shared, cross-module types and the response envelope. Module-specific `XyzDto` / `XyzBody` types do **not** live here: they are co-located in each module's `<Module>.types.ts` (the old `models/dtos/` and `models/requests/` folders are gone).

| Path                              | Contents                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `databases/tb_<table>.ts`         | One DB row type per live table, `ITB_<TABLE>` (see rules below). Shared by services, tests and several modules, so they stay central.                                                                                                                                                                                               |
| `IRequestLogContext.ts`           | `IRequestLogContext` / `IRequestLogEvent` / `LogStage` / `LogEventType`: the per-request log tree. Written by `utils/logging`, carried on `req.logContext` and passed to every service, so it is shared infrastructure rather than a logging-internal type.                                                                         |
| `responses/ControllerResponse.ts` | Builds and sends the `{ code, status, data }` envelope and records it in the request tree. Created by `route()` (`utils/RequestUtilities.ts`); `ok<T>()` 200, `ko()` 500 (generic message in prd, cause logged), `result()` any status, `badAuthorization()` plain-string 401 (x-api-key contract). `ResponseStatus` = `Ok` / `Ko`. |
| `Models.test.ts`                  | Row-type naming/liveness/`RecordStatus` checks against the migrations, and the envelope over HTTP (in-process).                                                                                                                                                                                                                     |

Related types that live elsewhere:

- Session payload `IDecodedTokenUser` → `src/token/Token.types.ts`.
- `req.user` / `req.logContext` → global Express augmentation in `src/types/express/index.d.ts`. Handlers and middlewares take a plain express `Request`; there are no `RequestWithXyz` interfaces.
- Request-log reader DTOs (`RequestLogEntryDto`, `RequestLogMatchDto`, …) → `src/utils/logging/RequestLog.types.ts`.

### Row type rules (enforced by `Models.test.ts`)

- File `tb_<table>.ts` named exactly after the table; it exports one interface `ITB_<TABLE>` (e.g. `tb_travel_agenda_item.ts` → `ITB_TRAVEL_AGENDA_ITEM`, `tb_lrt_mrt_station.ts` → `ITB_LRT_MRT_STATION`).
- Only for tables that exist after replaying the migrations; delete the type when its table is dropped.
- `record_status: RecordStatus` (`tb_tg_stats_whitelist` also allows its legacy `"I"`, `WHITELIST_REMOVED_STATUS` in `tgimage/TgImage.types.ts`). No `any`.
- Columns that are `NULL` / `DEFAULT NULL` in the migrations are typed `| null`. `?` marks columns an insert may omit (auto-increment ids, defaults).
- BIGINT ms timestamps are `number` (mysql2 returns BIGINT as a JS number by default).
- Fixed value sets come from the owning module's types (`import type`), e.g. `BudgetItemStatus`, `AgendaListType`, `UserState`.
- DECIMAL columns are typed `number | string`: inserts write numbers, mysql2 reads them back as strings. Mappers turn them into numbers with `toDecimalNumber` (`utils/NumberUtilities.ts`): NULL → `null`, never 0; an unreadable value → `null` + a PM2 warning. The API never returns a DECIMAL string.
- There is no hand-written schema file: the schema lives in `src/migrations`.
