## Middlewares

The request pipeline. Global order (see `src/app.ts` and MINDMAP "Middleware stack"): CORS → security headers → `globalLimiter` → cookieParser / body parsers → the route's preset chain → router → 404 catch-all (registry `Exceptions.NotFound`) → `ErrorHandler`.

Route groups get their chain **only** from `presets.ts` (`mw.*`); routers add per-route `MandatoryTokenFilter` / `OptionalTokenFilter` / limiters only when some of their routes need them.

| Preset           | Chain                                                               | Used by                                               |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| `mw.pub`         | RestRequestLogger                                                   | `GET /img/:code`                                      |
| `mw.std`         | RestRequestLogger → RequestHeaderFilter                             | open routers (auth, itinerary, analytics, …)          |
| `mw.auth`        | … → MandatoryTokenFilter                                            | JWT routers (budget, todo, applepay, …)               |
| `mw.authUpload`  | RestRequestLogger → MandatoryTokenFilter                            | `/img` uploads (multipart, so no RequestHeaderFilter) |
| `mw.ssKey`       | RestRequestLogger → RequestHeaderFilter → RequestApiKeyFilter("ss") | `/v1/ss`, `/v2/ss` (iPhone Shortcuts / Scriptable)    |
| `mw.housePublic` | RestRequestLogger → houseViewLimiter                                | `/house/view/:token`                                  |
| `mw.pdcaPublic`  | RestRequestLogger → stripPersonalDataFromLog → RequestHeaderFilter  | `/pdca`                                               |

---

### RestRequestLogger

- Opens `req.logContext` (request tree): `requestId` `req_<12 hex>`, method, redacted path and payload (GET → query, else body; a missing body logs `{}`), `ip` = `clientIp(req)` (X-Real-IP → socket address → `"Unknown"`, always a string).
- On `finish` it flushes the tree (console + request-log file) and fans out the Telegram alert. The callback catches and logs every failure, so a broken flush can never become an unhandled rejection.
- Telegram targets: 4xx/5xx and unmapped routes → every subscribed chat; successes on a mapped module → chats that haven't muted it (`TelegramLogModules.ts`, `tb_telegram_log_subscription`); successes on `TELEGRAM_SILENT_ROUTES` (`POST /analytics/heartbeat`, `/analytics/collect`, `/camera/device/register`) → none. A subscription lookup failure sends nothing.

### RequestHeaderFilter

- `User-Agent` required → else **400** `invalid_request_user-agent`.
- `POST` must send `Content-Type: application/json` (charset allowed) → else **415** `unsupported_media_type`. Bodyless POSTs send `{}`.
- Both are thrown and answered by `ErrorHandler` (registry shape, envelope status = HTTP status text).

### MandatoryTokenFilter / OptionalTokenFilter / resolveSessionUser (`TokenFilter.ts`)

- JWT from the httpOnly `jwt_token` cookie, verified (HS256) and compared with `tb_aa_user.token` for an active user (`username_system`, `record_status = 'A'`): logout / password change revoke it. `req.user` = JWT claims + `id` and `roles` **from the DB row**.
- CSRF double-submit on non-GET/HEAD/OPTIONS: `X-CSRF-Token` header must equal the `csrf_token` cookie (UTF-8 byte lengths compared first, then timing-safe; a same-character-count header with more bytes is a mismatch → 403, user decision M3). Checked **after** the session.
- Mandatory answers (fndom's HttpClient logs out on `401` + `status: "token_invalid"`, so these keep their custom envelope status and string `data`):

| Status | `status`        | `data`                                                  | When                                                                                              |
| ------ | --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 401    | `token_invalid` | `Authentication required.`                              | no cookie                                                                                         |
| 401    | `token_invalid` | `Your session has expired. Please log in again.`        | JWT expired                                                                                       |
| 401    | `token_invalid` | `Invalid authentication. Please log in again.`          | bad JWT                                                                                           |
| 401    | `token_invalid` | `Your session is no longer valid. Please log in again.` | token rotated/revoked, user gone or soft-deleted                                                  |
| 403    | `csrf_invalid`  | `Invalid or missing CSRF token.`                        | valid session, CSRF missing/mismatched                                                            |
| 500    | `Ko`            | `Failed to check your session. Please try again later.` | the session lookup failed (DB down; user decision M2), logged with its cause; generic text in prd |

- Optional: never 401. No/bad/revoked token → visitor (`req.user` unset). A valid session on a mutating request still needs CSRF → the same 403. A failed lookup → the same 500 as Mandatory (M2).
- `resolveSessionUser(token)`: the same check for the camera dashboard WebSocket (returns user or null for a missing/invalid/revoked token; a failed lookup throws → the upgrade answers 500 (M2); CSRF is replaced by an Origin check there).

### RequestApiKeyFilter (`ApiKeyFilter.ts`)

- `x-api-key: <prefix>_<value>`, exactly one `_` (keys are hex; `ss_<key>_anything` is an invalid key, user decision M4); each mount names its accepted prefixes (only `ss` today). Looks up `sha256Hex(value)` in the prefix's table (`tb_ss_api_key`, active keys) and checks the owner has an active user row (`record_status = 'A'`; a soft-deleted owner counts as gone). The owner's id goes to `logContext.metadata.userId` → read it with `getApiKeyUserId(req)`.
- Any key failure (missing/empty header, malformed, wrong prefix, unknown or revoked key, owner row missing or soft-deleted) → **401** `{ code: 401, status: "Ko", data: "Unauthorized. Missing or invalid API key." }` (Shortcuts contract, kept as a plain string).
- A DB failure → **500** `{ code: 500, status: "Ko", data: "Failed to check the API key. Please try again later." }` (generic text in prd; user decision M2), logged to PM2 and the request tree with its cause.
- The raw key is never stored on the log context.

### Rate limiters (`RateLimiter.ts`)

Per-IP unless noted (X-Real-IP, IPv6 collapsed to /56, socket address if the header is missing), draft-7 `RateLimit` / `RateLimit-Policy` headers, 429 body `{ success: false, message }`. "Failures only" limiters count responses with status ≥ 400, plus 200s a handler flags with `countAsFailedAttempt(res)` (a wrong password on `/auth/password/validate`).

| Limiter                     | Limit / window | Notes                                                                                 |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `globalLimiter`             | 100 / 1 min    | every route                                                                           |
| `loginLimiter`              | 10 / 15 min    |                                                                                       |
| `preflightLimiter`          | 30 / 15 min    | `/auth/preflight` (account existence)                                                 |
| `passwordCheckLimiter`      | 10 / 15 min    | failures only, keyed on `req.user.id`; `/auth/password/validate` + `/update` share it |
| `registerLimiter`           | 5 / 1 h        |                                                                                       |
| `verifyEmailLimiter`        | 10 / 15 min    |                                                                                       |
| `resendVerifyLimiter`       | 3 / 15 min     |                                                                                       |
| `adminLimiter`              | 60 / 15 min    | auth + analytics admin                                                                |
| `itineraryChallengeLimiter` | 10 / 15 min    | failures only                                                                         |
| `weddingRsvpLimiter`        | 10 / 15 min    |                                                                                       |
| `houseViewLimiter`          | 60 / 1 min     |                                                                                       |
| `analyticsLimiter`          | 120 / 1 min    |                                                                                       |
| `analyticsReportLimiter`    | 30 / 1 min     |                                                                                       |
| `cameraRegisterLimiter`     | 30 / 1 h       |                                                                                       |
| `cameraClaimIpLimiter`      | 10 / 15 min    | failures only                                                                         |
| `cameraClaimUserLimiter`    | 5 / 15 min     | failures only, keyed on `req.user.id`                                                 |
| `pdcaEnquiryLimiter`        | 5 / 10 min     |                                                                                       |

Raw WebSocket upgrades never reach Express, so `createUpgradeLimiter({ windowMs, limit })` is a small synchronous fixed-window counter with the same key (X-Real-IP, IPv6 /56, socket address): `allow(req)` counts the attempt and returns whether it is within the limit. Used for `/camera/ws/phone`: `CAMERA_PHONE_UPGRADE_LIMIT` 60 per `CAMERA_PHONE_UPGRADE_WINDOW_MS` 15 min → 429 on the upgrade before any DB lookup.

### ErrorHandler

Last middleware; replaces Express's HTML error page (no stack leaks). `BaseException` → its status + registry body; Multer → 413 (file size) / 400; http-errors 4xx (body-parser, CORS) → message if `expose`, else the status text; malformed JSON → 400 `Malformed JSON body`; anything else → 500 generic message. Errors raised before RestRequestLogger (CORS, JSON parsing) are answered without the request tree. Headers already sent → handed to Express to close the connection.

Tests: `Middlewares.test.ts` (in-process, fake DB, flush/Telegram stubbed).
