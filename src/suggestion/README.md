## Suggestion Controller

Admin-curated trip suggestions shown in the travel planner: **packing** items and per-country **notes** (visas, arrival cards).

- **Auth:** mounted under `mw.std`. GETs are public. Writes add `MandatoryTokenFilter` per route + `requireRole(LEGACY_ADMIN | OWNER)`. They're called by hand (curl/Postman), not from fndom.
- Soft delete (`record_status`). Ids are the auto-increment ids (public, curated data).

---

| Method | Path                             | Auth   | Body / query                                                                                                                                             | Response (`data`)                                                      |
| ------ | -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET`  | `/suggestion/packing`            | public |                                                                                                                                                          | `PackingSuggestionDto[]` `{ id, tripType, label, labelKey, category }` |
| `POST` | `/suggestion/packing`            | admin  | `{ tripType (≤64), label (≤255), labelKey? (≤128), category? (≤64) }`                                                                                    | `PackingSuggestionDto`                                                 |
| `POST` | `/suggestion/packing/:id/delete` | admin  | `{}`                                                                                                                                                     | `{ deleted: true }`                                                    |
| `GET`  | `/suggestion/note?country=`      | public | `country` (≤128, exact, case-insensitive)                                                                                                                | `NoteSuggestionDto[]`                                                  |
| `POST` | `/suggestion/note`               | admin  | `{ country, title (≤255), url (http/https, ≤512), category?, mandatory?: boolean, minDaysBeforeArrival?, maxAdvanceHours? (whole ≥ 0), notes? (≤5000) }` | `NoteSuggestionDto`                                                    |
| `POST` | `/suggestion/note/:id/delete`    | admin  | `{}`                                                                                                                                                     | `{ deleted: true }`                                                    |

`NoteSuggestionDto` = `{ id, country, title, url, category, mandatory: boolean, minDaysBeforeArrival, maxAdvanceHours, notes }`.

> Nov 2026: responses moved from raw snake_case rows to camelCase DTOs (fndom panels updated on `refactor/qindom-alignment`), and `DELETE /:id` became `POST /:id/delete`. The activity/place suggestion tables were dropped in Sep 2026.

##### Errors

| Status | When                        | `data.code`                   |
| ------ | --------------------------- | ----------------------------- |
| 400    | invalid body / query / id   | `invalid_request_<field>`     |
| 401    | write without login         | (TokenFilter `token_invalid`) |
| 403    | write without an admin role | `forbidden_access`            |
