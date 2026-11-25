## SS API Key Controller

- Manages the user's `ss_` API key, used by Siri Shortcuts / Scriptable (`x-api-key` header on `/v1/ss/*`, `/v2/ss/*`).
- **Auth:** JWT (`mw.auth`). Every route acts on the logged-in user's own key.
- One active key per user. Only `sha256Hex(raw)` + a 5-char hint are stored (`tb_ss_api_key`); the raw key is returned once.

---

| Method | Path | Body | Response (`data`) |
|---|---|---|---|
| `GET` | `/ss-key/api-key` | | `SsApiKeyStatusDto` `{ hasKey, name, createdDt, keyHint }` (all `null` when no key) |
| `POST` | `/ss-key/api-key` | `{}` | `SsApiKeyGeneratedDto` `{ key: "ss_<64 hex>" }`. Revokes the previous key first. |
| `POST` | `/ss-key/api-key/name` | `{ name }` (trimmed, 1–100 chars) | `SsApiKeyStatusDto`. Label only; the key keeps working. |
| `POST` | `/ss-key/api-key/delete` | `{}` | `SsApiKeyRevokedDto` `{ revoked: true }` |

##### Errors
| Status | When | `data.code` |
|---|---|---|
| 400 | `name` missing, blank, > 100 chars or not a string | `invalid_request_name` |
| 401 | not logged in | (TokenFilter `token_invalid`) |
| 404 | rename with no active key | `entity_not_found` |

> `POST /api-key/delete` replaced `DELETE /api-key` in Nov 2026 (mutations are POST); fndom's `ssApiKey` store was updated with it.
