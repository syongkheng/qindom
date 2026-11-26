## House

Saved house-planner layouts and read-only share links. The planner itself works logged out (localStorage); these endpoints add saving and sharing.

- Body for creating a layout or a share link: `{ name (1–100), data }`. `data` is the planner's export JSON `{ plan?, items[≤500], custom?[≤200], walls?[≤400] }`, ≤ 1 MB once stored. **Only the envelope is checked**: the client re-sanitises every item and wall on load. Stored as MEDIUMTEXT with `version: 1`.
- Owner-scoped; soft delete. Caps: **30 layouts** and **20 share links** per user (400 `invalid_request_layouts` / `invalid_request_shares`).

---

### Layouts `/house-layout` (JWT)

| Method | Path                             | Body                     | Response (`data`)                                   |
| ------ | -------------------------------- | ------------------------ | --------------------------------------------------- |
| `GET`  | `/house-layout`                  |                          | `{ layouts: HouseLayoutSummaryDto[] }` newest first |
| `GET`  | `/house-layout/:layoutId`        |                          | `HouseLayoutDto` (summary + `data`)                 |
| `POST` | `/house-layout`                  | `{ name, data }`         | `HouseLayoutSummaryDto`                             |
| `POST` | `/house-layout/:layoutId/update` | `{ name?, data? }` (≥ 1) | `HouseLayoutSummaryDto`                             |
| `POST` | `/house-layout/:layoutId/delete` | `{}`                     | `{ deleted: true }`                                 |

`HouseLayoutSummaryDto` = `{ id (uuid), name, itemCount, createdAt, updatedAt }`.

### Share links `/house/share` (JWT) + `/house/view/:token` (public, 60/min/IP)

| Method | Path                         | Body                                                              | Response (`data`)                                                |
| ------ | ---------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/house/share`               |                                                                   | `{ shares: HouseShareSummaryDto[] }` newest first                |
| `POST` | `/house/share`               | `{ name, data }` (a **copy**: later layout edits don't change it) | `HouseShareSummaryDto` `{ token, name, itemCount, createdAt }`   |
| `POST` | `/house/share/:token/delete` | `{}`                                                              | `{ deleted: true }` (revoke)                                     |
| `GET`  | `/house/view/:token`         |                                                                   | `HouseShareViewDto` `{ name, createdAt, data }`: never the owner |

Token = random UUID.

##### Errors

| Status | When                                           | `data.code`                                                                      |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| 400    | bad name / data / empty update; cap reached    | `invalid_request_<field>` / `invalid_request_layouts` / `invalid_request_shares` |
| 401    | not logged in (owner routes)                   | (TokenFilter `token_invalid`)                                                    |
| 404    | layout / link not found, not yours, or revoked | `entity_not_found`                                                               |
| 429    | public view over 60/min/IP                     | rate limiter                                                                     |
