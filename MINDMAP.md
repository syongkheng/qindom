# qindom — Project Mindmap

Express 5 + TypeScript + MySQL (db `wuxi`) via Knex. Native ESM (`"type": "module"`, `nodenext`, relative imports need `.js`). Dev runner: `tsx watch`. Deploy: AWS EC2 ap-southeast-1, port 3000, PM2 (`ecosystem.config.cjs`) behind nginx.

## Infrastructure
- Network: EC2 security group inbound = HTTP 80, HTTPS 443, SSH 22 (all `0.0.0.0/0`); nginx proxies to :3000 and sets `X-Real-IP`.
- Deps: express ^5.1 (5.2.1), sharp 0.35.5, knex ^3.1, node-telegram-bot-api ^1.1, TypeScript ^5.9. `npm audit` clean as of 2026-10-07.
- Envs: Dev `.env.dev` (Telegram polling) · Prod `.env`, `NODE_ENV=prd` (Telegram webhook).
- `postinstall`: `scripts/apply-patches.js` applies `patches/*.patch`; deploy.sh doesn't ship `scripts/`/`patches/`, so patches never apply on EC2.
- `deploy.sh`: rsync of `dist/` excludes `node_modules`, `.env`, `serviceAccountKey.json`, `logs`, `package*.json`, `.lock.sha` so `--delete` doesn't wipe them on EC2; deps reinstall only when `package-lock.json` sha differs from `.lock.sha`; after PM2 start it polls `localhost:3000/connectivity` (15×2s) and exits non-zero with PM2 logs if unhealthy.
- Knex CLI scripts run via `node --import tsx`; `__dirname` via `fileURLToPath(import.meta.url)`.

## Middleware stack (global → route-level)
1. **CORS** (`ALLOWED_ORIGINS`), security headers (nosniff, X-Frame DENY, no-referrer, HSTS in prd).
2. **globalLimiter** 100 req/min/IP. All limiters (`RateLimiter.ts`) key on `X-Real-IP` (set by nginx; no `trust proxy`). Safe because the EC2 security group only exposes 80/443/22, so port 3000 is reachable only via nginx.
3. cookieParser, `express.json` 5MB, urlencoded.
4. **RestRequestLogger** — per-request log tree (stages: middleware → controller → service), console + request-log file (`RequestLogFileWriter`, 50MB rotation; prd `/home/ubuntu/.pm2/logs/qindom-request-tree.log`, dev `./logs/`). Telegram alerts: compact access-log line + link to fndom `/admin/log-searcher?requestId=…`. Suppression of non-error traffic only (4xx/5xx always alert) via hardcoded `TELEGRAM_SILENT_ROUTES` and per-(chat, module) toggles in `tb_telegram_log_subscription` (fan-out to every active `tb_tg_stats_whitelist` chat; admin matrix at fndom `/admin/telegram-log-subscriptions`, SYSTEM_R5; 30s cache; module key via `TelegramLogModules.ts`).
5. **Redaction** (`LogRedaction.ts`) by field name: passwords, tokens/jwt/secret, apiKey, otp/pin/verify_code/captcha, smsBody, authorization/cookie, blob; `code` only if OTP-shaped, `key` only if API-key-shaped; emails masked; regex pass on free text.
6. **RequestHeaderFilter** — POST needs `Content-Type: application/json` (so bodyless POSTs send `{}`).
7. **MandatoryTokenFilter / OptionalTokenFilter** (`TokenFilter.ts`) — JWT in httpOnly cookie `jwt_token` (HS256 pinned, 30d), token compared to `tb_aa_user.token` (revocation; Optional drops to visitor on mismatch), roles read from DB row not JWT, double-submit CSRF (`csrf_token` cookie == `X-CSRF-Token` header on non-GET, timing-safe). Cookies scoped `.awense.com` in prd (`AuthCookieUtilities.ts`).
8. **RequestApiKeyFilter(...prefixes)** — `x-api-key` → `tb_ss_api_key` hash lookup; each route names accepted prefix (`mw.ssKey` → `/v1/ss`, `/v2/ss`). `TokenOrApiKeyFilter.ts` unused. IoT routes removed Oct 2026 (redaction still masks `iot_` keys).
9. **ErrorHandler** — registered last; replaces Express default (no stack leaks). BaseExceptions → status, Multer → 413/400, http-errors → 4xx, else generic 500.

## Route table (index.ts) — `mw.std` open, `mw.auth` JWT, `mw.pub` public
| Prefix | Auth | Module |
|---|---|---|
| /connectivity | std | health check |
| /analytics | std | heartbeat, event ingest |
| /hdb, /lta, /geocode | std | HDB, LTA, Nominatim proxy |
| /auth, /pfp | std | auth, profile |
| /itinerary | std | trips |
| /budget, /trail | auth | budget, trail |
| /applepay | auth | Apple Pay dashboard |
| /file | auth | itinerary file records |
| /img | pub GET / JWT upload | Telegram image CDN |
| /v1/ss, /v2/ss | api-key | Siri Shortcut ingestion |
| /ss-key | auth | API-key mgmt |
| /wedding | std | RSVP |
| /suggestion | std | suggestions (admin writes) |
| /debug | open in dev; JWT + SYSTEM_R5 in prd | `GET /status/:code` logging test |


## Modules
- **AUTH `/auth`** — register → OTP email → verify → JWT set via Set-Cookie only (never in body). `POST /logout` clears cookies; `POST /verification` reads cookie. bcrypt 10 rounds; OTP SHA-256, 15-min TTL, max 5 attempts (429). Limits: 5 reg/hr, 10 login/15min, verify 10/15min, resend 3/15min. Usernames 3–64 chars, HTML-escaped in emails. **Dev OTP bypass:** code `111111` accepted only when `NODE_ENV === "dev"`. Admin (SYSTEM_R5): `GET /admin/recent-request-logs?limit=`, `GET /admin/request-logs/:requestId` (`req_` + 12 hex; older 5-hex ids accepted; parsed by `RequestLogParser.ts`, must track `LoggingUtilities.render()`). DB: `tb_aa_user` (unique `username_system_active` among active rows).
- **PROFILE `/pfp`** — profile, avatar, username change. DB: `tb_aa_user`.
- **ANALYTICS `/analytics`** — `POST /heartbeat` (upsert by session_id), `POST /event`; `system` field = source app. DB: `tb_analytic_user_activity`, `tb_analytic_event`.
- **ITINERARY `/itinerary`** — trips shareable via `short_code` + 6-char PIN; `POST /challenge` limited to 10 failed/15min/IP. Agenda items (nullable day/date, `unknown_time`, `list_type` todo|place), bookings, packing, notes. `POST /edit/:sessionId`: child rows addressed by client ids → **every update/delete scoped by `itinerary_id`**, foreign agenda id → ForbiddenAccess + rollback (keep on any new child write). JWT-only. DB: `tb_travel_itinerary`, `_agenda_item`, `_agenda_file`, `_itinerary_booking`, `_itinerary_view`, `_packing_item`, `_note_item`.
- **FILE `/file`** — records `{uuid, agendaId, tgShortCode, mimeType, name, sizeInBytes}` pointing at `/img` uploads; owner-checked via itinerary. Known gaps: `tgShortCode` ownership and `mimeType` unvalidated. DB: `tb_travel_agenda_file`.
- **IMAGE CDN `/img`** (`src/tgimage/`) — `POST /upload` (JWT, multer 30MB memory → Telegram sendDocument, 8-hex shortCode, `tb_tg_image`); `GET /:shortCode` public, streamed from Telegram, re-encoded by sharp, CSP `default-src 'none'; sandbox`. SVG never served raw (rasterised to PNG on upload and on read). `/admin/list|add|remove` (SYSTEM_R5) → `tb_tg_stats_whitelist`.
- **GEOCODE `/geocode?q=`** — Nominatim proxy, DB-cached (`tb_geocode_cache`, failures not cached), queue ≥1.1s/call, max 5 waiting, q ≤ 200 chars.
- **HDB `/hdb`** — property search, nearest (Haversine); coordinate admin routes (`/pphs/update|clear-coordinates|geocode-options|refresh`) need PPHS_R5|SYSTEM_R5. DB: `tb_hdb_pphs`, `tb_hdb_pphs_coordinate`.
- **LTA `/lta`** — bus arrivals (DataMall), nearest stops/MRT. DB: `tb_lta_busstop`, `tb_lta_bus_info`, `tb_lrt_mrt_station`.
- **FND / Kingdom 236** — Discord bot (prefix `!`: hello, ping, help, register, deregister, list, redeem, remind, stalk); auto gift-code watcher on `GIFT_CODE_WATCH_CHANNEL_IDS` → `executeRedemption()`; Discord↔governor via Firestore.
- **SIRI SHORTCUTS (API-key)** — V1 `POST /v1/ss/ap/transaction {amount, merchant, name}` (Apple Pay NFC; `$` stripped); V2 `POST /v2/ss/ap/sms {smsBody}` (regex-parses amount, merchant, card last 3–4; UOB/DBS). `occurred_dt` always server-stamped. Both write `tb_applepay_transaction` (`source` v1|v2|manual).
- **APPLE PAY DASHBOARD `/applepay`** (JWT) — `GET /` (v1+v2 feed), `POST /` manual entry (no future dates, 5-min skew), `POST /:id/delete` (soft), `POST /:id/category`, `POST /card-label/:cardLast4`. Owner-scoped; uuid is public id. Duplicate detection/CSV export are frontend-only. DB: `tb_applepay_transaction`, `tb_applepay_card_label`. Shared service: `SsApplePayV1Service`.
- **SS API KEY `/ss-key`** (JWT) — `GET/POST/DELETE /api-key`, `POST /api-key/name` (≤100 chars). One active `ss_` key per user, SHA-256 hashed, shown once. DB: `tb_ss_api_key`.
- **SUGGESTION `/suggestion`** — `activity`, `packing`, `note` (by country, exact), `place` (curated): GETs public (fuzzy `LOWER LIKE`), writes admin-only (JWT + role admin); `/activity/admin/list`, `/place/admin/list` for fndom `/admin/suggestions`. DB: `tb_suggestion_activity|packing|note|place`.
- **BUDGET `/budget`** (JWT) — shared budget tables: `GET /`, `POST /`, `GET /:sessionId`, `POST /edit|delete/:sessionId`, items (`POST /:sessionId/item`, `/item/:itemId`, `/item/:itemId/delete|restore`), collaborators (`POST /:sessionId/collaborator`, `/collaborator/:userId/delete`). DB: `tb_budget_table`, `tb_budget_item`, `tb_budget_collaborator`.
- **TRAIL `/trail`** (JWT) — sessions (`GET|POST /sessions`, `GET /sessions/:sessionId`, `POST /sessions/:sessionId/complete|delete`) and custom trails (`GET|POST /custom`). DB: `tb_trail_session`, `tb_trail_split`, `tb_trail_custom`.
- **WEDDING `/wedding`** (frontend `../jessikheng`)
  - `POST /rsvp` — fields: name, email, attending, contactNumber?, dietary?, mealPreference?, `additionalGuestContact[]`. **Keyed by email:** re-submitting an email soft-deletes that email's previous RSVP + guests (and rows where it was a guest) and creates a new row with a new 4-digit PIN. No PIN needed to overwrite (deliberate: every RSVP is also emailed, so an overwritten guest contacts the couple to reconcile). Sends confirmation (with PIN) to submitter and any guest emails. Returns `{pin, notice: WEDDING_PDPA_NOTICE}`; auto-increment id never exposed.
  - `POST /rsvp/preflight {email}` — returns `{exists, hasEmail}` only.
  - `GET /rsvp/status?name=&pin=` — requires both; name must be on that PIN's RSVP; names masked (`MaskingUtilities.maskName`).
  - PINs: 4 digits, `Math.random`, unique among rows; only globalLimiter protects lookup (deliberate). PDPA notice promises deletion day after wedding — no purge job yet (manual table drop).
  - DB: `tb_wedding_rsvp`, `tb_wedding_rsvp_guest`.

## External services
MySQL · Nominatim · Firebase/Firestore · LTA DataMall · Telegram Bot API (`node-telegram-bot-api` ^1.1, ESM, fetch-based) · Discord.js · Nodemailer (OTP/RSVP email).

## DB patterns
- Soft delete `record_status` 'A'/'D'; timestamps are ms epoch (`Date.now()`); JSON fields (roles, pax_names…) stored as strings; audit `created_by`/`updated_by` (username).
- Never put plain UNIQUE on a user-chosen value (a 'D' row would block a new one): use a VIRTUAL column `IF(record_status='A', col, NULL)` + UNIQUE. System ids (uuid, session_id, short_code) stay plain UNIQUE.
- `KnexSqlUtilities` takes optional `logContext` (last param) and auto-emits timed SQL events; all raw SQL uses bindings.

## Code conventions
- Response interfaces `XyzDto` → `models/dtos/`; request bodies `XyzBody` → `models/requests/`; DB rows `ITB_*`/`ITb*` → `models/databases/`.
- URLs use hyphens. Envelope `{ code, status: "Ok"|"Ko", data }`.
- Controller factory `createXyzController(db)` → Router. Role guard `hasRole(req, ...roles)` (`requestUtils`).
- Exceptions: always throw typed `BaseExceptions` (never return error strings); controllers catch with `handleException(err, cr, label, fallback)`: BaseExceptions → `cr.result(status, name, clientMessage)`, else log + `cr.ko(fallback)` (real cause kept in request tree).
- Logging: services take `logContext?: IRequestLogContext`, emit events via `LoggingUtilities.request.branch()` (pending-event pattern: set `.detail` after the async result); controllers pass `req.logContext`.
