## Todo Controller

- Personal to-do list. **Auth:** JWT (`mw.auth`). Every route acts on the caller's own tasks; the task `uuid` is the public `id`.
- Rules: completing a task stamps `doneAt` and un-pins it; done tasks can't be pinned; **max 3 pinned** (fndom enforces the same cap). Delete is soft; restore is the client's 5 s undo.
- Lock-screen widget feed: `GET /v1/ss/todo` (ss_ API key) → `TodoWidgetDto` `{ tasks: string[≤3], openCount }`, served by `siri-shortcut/Todo.v1.controller.ts`.

---

| Method | Path | Body | Response (`data`) |
|---|---|---|---|
| `GET` | `/todo` | | `TodoListDto` `{ tasks: TodoTaskDto[] }` (active, by `sortOrder`) |
| `POST` | `/todo` | `{ title }` (trimmed, 1–500) | `TodoTaskDto` |
| `POST` | `/todo/reorder` | `{ ids: uuid[] }` (≤ 1000; full manual order; unknown ids ignored) | `TodoListDto` |
| `POST` | `/todo/:taskId/update` | `{ title?, done?, pinned? }` (≥ 1 field) | `TodoTaskDto` |
| `POST` | `/todo/:taskId/delete` | `{}` | `TodoDeletedDto` `{ deleted: true }` |
| `POST` | `/todo/:taskId/restore` | `{}` | `TodoTaskDto` (pin dropped if the cap filled meanwhile) |

`TodoTaskDto` = `{ id, title, done, doneAt: number | null, pinned, createdAt, sortOrder }`.

##### Errors
| Status | When | `data.code` |
|---|---|---|
| 400 | bad `title` / `done` / `pinned` / `ids`, empty update | `invalid_request_<field>` / `invalid_request_body` |
| 400 | pinning a 4th task | `invalid_request_pinned` ("Limit reached - pinned") |
| 401 | not logged in | (TokenFilter `token_invalid`) |
| 404 | task not found / not yours / wrong state for delete or restore | `entity_not_found` |
