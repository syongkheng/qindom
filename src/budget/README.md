## Budget

Shared budget tables (Notion-style: category / to buy / bought views in fndom). **Auth:** JWT (`mw.auth` on the `/budget` mount).

- A table is addressed by its `sessionId` (uuid); an item by its `id` (uuid). Auto-increment ids are never exposed.
- **Access:**
  - **owner** (creator): everything;
  - **active collaborator**: read the table and create / edit / delete / restore its items;
  - **owner only**: rename, delete the table, add / remove collaborators (collaborators get 403);
  - anyone else: 403. A missing or deleted table is 404.
- Items are always looked up inside the table in the URL: an item from another table is 404.
- Deleting a table soft-deletes it and all its items. Item delete is soft; restore is fndom's 10 s undo (not enforced server-side).
- Collaborators are invited by the email of an existing, active account. Re-inviting a removed collaborator reactivates them.

---

| Method | Path                                             | Body                                                                      | Response (`data`)                                 |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------- |
| `GET`  | `/budget`                                        |                                                                           | `BudgetTableListDto` `{ myTables, sharedTables }` |
| `POST` | `/budget`                                        | `{ name (1–255), template? }` (template defaults to `other`)              | `{ sessionId }`                                   |
| `GET`  | `/budget/:sessionId`                             |                                                                           | `BudgetTableDto`                                  |
| `POST` | `/budget/:sessionId/update`                      | `{ name (1–255) }` (owner)                                                | `{ renamed: true }`                               |
| `POST` | `/budget/:sessionId/delete`                      | `{}` (owner)                                                              | `{ deleted: true }`                               |
| `POST` | `/budget/:sessionId/item`                        | `{ name, category?, status?, budgetAmount?, actualAmount?, notes? }`      | `BudgetItemDto`                                   |
| `POST` | `/budget/:sessionId/item/:itemId/update`         | any of the item fields (≥ 1); `null` clears category / amounts / notes    | `BudgetItemDto`                                   |
| `POST` | `/budget/:sessionId/item/:itemId/delete`         | `{}`                                                                      | `{ deleted: true }`                               |
| `POST` | `/budget/:sessionId/item/:itemId/restore`        | `{}`                                                                      | `BudgetItemDto`                                   |
| `POST` | `/budget/:sessionId/collaborator`                | `{ email }` (owner)                                                       | `BudgetCollaboratorDto`                           |
| `POST` | `/budget/:sessionId/collaborator/:userId/delete` | `{}` (owner; answers `removed: true` even if they weren't a collaborator) | `{ removed: true }`                               |

Item fields: `name` 1–255 (trimmed), `category` ≤ 64, `notes` ≤ 1024 (blank → cleared), `status` `to_buy` (default) / `bought`, amounts are numbers within DECIMAL(12,2) (negatives allowed). Amounts may be omitted or `null` (= none).

- `BudgetTableSummaryDto` = `{ sessionId, name, template, createdDt, itemCount, sumBudget, sumActual }` (active items only; tables newest first).
- `BudgetTableDto` = `{ sessionId, name, template, createdDt, isOwner, items: BudgetItemDto[] (by sortOrder), collaborators: BudgetCollaboratorDto[] }`.
- `BudgetItemDto` = `{ id, name, category?, status, budgetAmount?, actualAmount?, notes?, sortOrder }`: empty optional fields are omitted, not `null`.
- `BudgetCollaboratorDto` = `{ userId, username, email }`.
- `template` is one of `home_reno`, `wedding`, `travel`, `other`; it picks fndom's preset category list and can't be changed.

##### Errors

| Status | When                                                                                                      | `data.code`                                        |
| ------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 400    | bad field, empty item update, bad `:userId`                                                               | `invalid_request_<field>` / `invalid_request_body` |
| 400    | inviting yourself                                                                                         | `invalid_request_email`                            |
| 401    | not logged in                                                                                             | (TokenFilter)                                      |
| 403    | not the owner / not an active collaborator                                                                | `forbidden_access`                                 |
| 404    | table missing or deleted; item not in this table or in the wrong state; no active account with that email | `entity_not_found`                                 |

Paths changed Nov 2026 (fndom updated): `POST /edit/:sessionId` → `/:sessionId/update`, `POST /delete/:sessionId` → `/:sessionId/delete`, `POST /:sessionId/item/:itemId` → `/:sessionId/item/:itemId/update`.
