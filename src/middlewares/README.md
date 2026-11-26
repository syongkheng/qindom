## Middlewares

The request pipeline. Global order (see `src/app.ts` and MINDMAP "Middleware stack"): CORS → security headers → `globalLimiter` → cookieParser / body parsers → the route's preset chain → router → 404 catch-all → `ErrorHandler`.

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
- CSRF double-submit on non-GET/HEAD/OPTIONS: `X-CSRF-Token` header must equal the `csrf_token` cookie (timing-safe). Checked **after** the session.
- Mandatory answers (fndom's HttpClient logs out on `401` + `status: "token_invalid"`, so these keep their custom envelope status and string `data`):

| Status | `status`        | `data`                                                  | When                                                                |
| ------ | --------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| 401    | `token_invalid` | `Authentication required.`                              | no cookie                                                           |
| 401    | `token_invalid` | `Your session has expired. Please log in again.`        | JWT expired                                                         |
| 401    | `token_invalid` | `Invalid authentication. Please log in again.`          | bad JWT, DB lookup failed, CSRF header with a different byte length |
| 401    | `token_invalid` | `Your session is no longer valid. Please log in again.` | token rotated/revoked, user gone or soft-deleted                    |
| 403    | `csrf_invalid`  | `Invalid or missing CSRF token.`                        | valid session, CSRF missing/mismatched                              |

- Optional: never 401. No/bad/revoked token or failed lookup → visitor (`req.user` unset). A valid session on a mutating request still needs CSRF → the same 403.
- `resolveSessionUser(token)`: the same check for the camera dashboard WebSocket (returns user or null; CSRF is replaced by an Origin check there).

### RequestApiKeyFilter (`ApiKeyFilter.ts`)

- `x-api-key: <prefix>_<value>`; each mount names its accepted prefixes (only `ss` today). Looks up `sha256Hex(value)` in the prefix's table (`tb_ss_api_key`, active keys) and checks the owner has an active user row (`record_status = 'A'`; a soft-deleted owner counts as gone). The owner's id goes to `logContext.metadata.userId` → read it with `getApiKeyUserId(req)`.
- Any failure (missing/empty header, wrong prefix, unknown or revoked key, owner row missing or soft-deleted, DB failure) → **401** `{ code: 401, status: "Ko", data: "Unauthorized. Missing or invalid API key." }` (Shortcuts contract, kept as a plain string). DB failures are also recorded in the request tree.
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

### ErrorHandler

Last middleware; replaces Express's HTML error page (no stack leaks). `BaseException` → its status + registry body; Multer → 413 (file size) / 400; http-errors 4xx (body-parser, CORS) → message if `expose`, else the status text; malformed JSON → 400 `Malformed JSON body`; anything else → 500 generic message. Errors raised before RestRequestLogger (CORS, JSON parsing) are answered without the request tree. Headers already sent → handed to Express to close the connection.

Tests: `Middlewares.test.ts` (in-process, fake DB, flush/Telegram stubbed).
