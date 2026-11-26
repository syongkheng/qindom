## Budget

Shared budget tables (Notion-style: category / to buy / bought views in fndom). **Auth:** JWT (`mw.auth` on the `/budget` mount).

- A table is addressed by its `sessionId` (uuid); an item by its `id` (uuid). Auto-increment ids are never exposed.
- **Access:**
  - **owner** (creator): everything;
  - **active collaborator** (their collaborator row and their user account are both active): read the table, create / edit / delete / restore its items, and leave it;
  - **owner only**: rename, delete the table, add / remove collaborators (collaborators get 403);
  - anyone else: 403. A missing or deleted table is 404.
- Items are always looked up inside the table in the URL: an item from another table is 404.
- Deleting a table soft-deletes it and all its items. Item delete is soft; restore is fndom's 10 s undo (not enforced server-side).
- Collaborators are invited by the email of an existing, active, **email-verified** account. Unknown, unverified and soft-deleted emails all get the **same** 404 (same code and message, one identical lookup), so an owner can't use the invite to find out whether an email has an account. Re-inviting a removed (or departed) collaborator reactivates them.
- **Soft-deleted = gone.** A collaborator whose user account is soft-deleted is not listed in `collaborators`, has no access, and doesn't see the table in `sharedTables`; their collaborator row is left as it is.
- Collaborators can leave a table themselves (`/leave`). The owner can't (they delete the table instead).
- Collaborators see each other's username and email in `GET /budget/:sessionId` (deliberate).

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
| `POST` | `/budget/:sessionId/leave`                       | `{}` (collaborator; soft-deletes the caller's own collaborator row)       | `{ left: true }`                                  |

Item fields: `name` 1–255 (trimmed), `category` ≤ 64, `notes` ≤ 1024 (blank → cleared), `status` `to_buy` (default) / `bought`, amounts are numbers within DECIMAL(12,2) (negatives allowed). Amounts may be omitted or `null` (= none).

- `BudgetTableSummaryDto` = `{ sessionId, name, template, createdDt, itemCount, sumBudget, sumActual }` (active items only; tables newest first).
- `BudgetTableDto` = `{ sessionId, name, template, createdDt, isOwner, items: BudgetItemDto[] (by sortOrder), collaborators: BudgetCollaboratorDto[] }`.
- `BudgetItemDto` = `{ id, name, category?, status, budgetAmount?, actualAmount?, notes?, sortOrder }`: empty optional fields are omitted, not `null`.
- `BudgetCollaboratorDto` = `{ userId, username, email }`.
- `template` is one of `home_reno`, `wedding`, `travel`, `other`; it picks fndom's preset category list and can't be changed.

##### Errors

| Status | When                                                                                        | `data.code`                                        |
| ------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 400    | bad field, empty item update, bad `:userId`                                                 | `invalid_request_<field>` / `invalid_request_body` |
| 400    | inviting yourself                                                                           | `invalid_request_email`                            |
| 401    | not logged in                                                                               | (TokenFilter)                                      |
| 403    | not the owner / not an active collaborator                                                  | `forbidden_access`                                 |
| 403    | the owner calls `/leave` (`The owner can't leave their own table`)                          | `forbidden_access`                                 |
| 404    | table missing or deleted; item not in this table or in the wrong state                      | `entity_not_found`                                 |
| 404    | invite: no active, verified account with that email (`No account available for that email`) | `entity_not_found`                                 |
| 404    | `/leave` by someone who isn't an active collaborator                                        | `entity_not_found`                                 |

Paths changed Nov 2026 (fndom updated): `POST /edit/:sessionId` → `/:sessionId/update`, `POST /delete/:sessionId` → `/:sessionId/delete`, `POST /:sessionId/item/:itemId` → `/:sessionId/item/:itemId/update`.
