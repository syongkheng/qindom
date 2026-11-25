## Profile Controller

- The logged-in user's profile: country, avatar photo, username.
- **Auth:** JWT cookie on every route (mounted under `mw.auth`). Every route acts on the caller's own `tb_aa_user` row (by id).
- URL prefix stays `/pfp` (fndom contract); files/classes are `Profile.*`.

---

| Method | Path | Body | Response (`data`) |
|---|---|---|---|
| `GET` | `/pfp/user/country` | | `ProfileCountryDto` `{ country: string \| null }` |
| `POST` | `/pfp/user/country` | `{ country: string }` (≤ 256 chars; `""` clears it) | `ProfileCountryDto` |
| `GET` | `/pfp/user/photo` | | `ProfilePhotoDto` `{ blobString: "data:image/...;base64,..." \| null }` |
| `POST` | `/pfp/user/photo` | `{ blobString: "data:image/<type>;base64,<data>" }` (≤ 5 MB request) | `ProfilePhotoUpdatedDto` `{ updated: true }` |
| `POST` | `/pfp/user/username` | `{ newUsername }` (trimmed, 3–64 chars) | `ProfileUsernameDto` `{ username }` + new `jwt_token` / `csrf_token` cookies |

fndom also sends `system`, `mimeType`, `sizeInBytes`, `fileName`; they're ignored.

Changing the username re-signs the JWT (the username is inside it and in the DB revocation key `username_system`), so the old cookie stops working and the response sets fresh ones.

##### Errors
| Status | When | `data.code` |
|---|---|---|
| 400 | bad `country` / `blobString` / `newUsername` | `invalid_request_<field>` |
| 401 | not logged in | (TokenFilter `token_invalid`) |
| 409 | username taken by another active user | `username_already_taken` |
