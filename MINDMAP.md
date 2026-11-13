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
| /budget | auth | budget |
| /applepay | auth | Apple Pay dashboard |
| /todo | auth | Personal to-do list |
| /house-layout | auth | Saved house-planner layouts |
| /house/share | auth | Create / list / revoke a user's house share links |
| /house/view/:token | public (`mw.housePublic`, 60/min/IP) | Read one shared house snapshot |
| /v1/ss/todo | ss_ API key | Lock-screen widget feed (Scriptable) |
| /file | auth | itinerary file records |
| /img | pub GET / JWT upload | Telegram image CDN |
| /v1/ss, /v2/ss | api-key | Siri Shortcut ingestion |
| /ss-key | auth | API-key mgmt |
| /mcp-key | auth | `mcp_` key mgmt for MCP clients |
| /mcp | PUBLIC (`mcpLimiter` 30/min/IP) | MCP server (Streamable HTTP), stateless, house layout editing |
| /wedding | std | RSVP |
| /suggestion | std | suggestions (admin writes) |
| /debug | open in dev; JWT + SYSTEM_R5 in prd | `GET /status/:code` logging test |


## Modules
- **AUTH `/auth`** — register → OTP email → verify → JWT set via Set-Cookie only (never in body). `POST /logout` clears cookies; `POST /verification` reads cookie. bcrypt 10 rounds; OTP SHA-256, 15-min TTL, max 5 attempts (429). `/verify-email` requires `password` too (bcrypt-checked; wrong password counts as an attempt) so a pre-registered squat can't be verified by the real owner. Unverified rows whose OTP lapsed count as free: preflight says register, register soft-deletes them (email or username). Register `system` must be in `REGISTER_SYSTEMS` (`["fnd"]`). Limits: 5 reg/hr, 10 login/15min, verify 10/15min, resend 3/15min. Usernames 3–64 chars, HTML-escaped in emails. **Dev OTP bypass:** code `111111` accepted only when `NODE_ENV === "dev"`. Admin (SYSTEM_R5): `GET /admin/recent-request-logs?limit=`, `GET /admin/request-logs/:requestId` (`req_` + 12 hex; older 5-hex ids accepted; parsed by `RequestLogParser.ts`, must track `LoggingUtilities.render()`). DB: `tb_aa_user` (unique `username_system_active` among active rows).
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
- **APPLE PAY DASHBOARD `/applepay`** (JWT) — `GET /` (v1+v2 feed), `POST /` manual entry (no future dates, 5-min skew), `POST /:id/delete` (soft), `POST /:id/restore` (undo: D -> A, owner-scoped, 404 if not deleted), `POST /:id/category`, `POST /card-label/:cardLast4`. Owner-scoped; uuid is public id. Duplicate detection/CSV export are frontend-only. DB: `tb_applepay_transaction`, `tb_applepay_card_label`. Shared service: `SsApplePayV1Service`.
- **SS API KEY `/ss-key`** (JWT) — `GET/POST/DELETE /api-key`, `POST /api-key/name` (≤100 chars). One active `ss_` key per user, SHA-256 hashed, shown once. DB: `tb_ss_api_key`.
- **SUGGESTION `/suggestion`** — `activity`, `packing`, `note` (by country, exact), `place` (curated): GETs public (fuzzy `LOWER LIKE`), writes admin-only (JWT + role admin); `/activity/admin/list`, `/place/admin/list` for fndom `/admin/suggestions`. DB: `tb_suggestion_activity|packing|note|place`.
- **TODO `/todo`** (JWT, `src/todo/`) — `GET /` (all active tasks by sort_order), `POST /` {title ≤500}, `POST /:taskId/update` {title?, done?, pinned?} (done sets done_dt + clears pin; max 3 pinned → 400), `POST /:taskId/delete` (soft) / `/restore` (client-side 5s undo), `POST /reorder` {ids[]} (full manual order → sort_order). uuid is public id; owner-scoped. Widget feed: `GET /v1/ss/todo` (x-api-key ss_, reuses SS key mgmt) → `{tasks: [≤3 titles, pinned first], openCount}` via `siri-shortcut/Todo.v1.controller.ts`. DB: `tb_todo_task` (migration 20261103000000).
- **HOUSE LAYOUT `/house-layout`** (JWT, `src/house/`) — `GET /` (summaries: id, name, itemCount, createdAt, updatedAt; newest first), `GET /:layoutId` (summary + `data`), `POST /` {name ≤100, data}, `POST /:layoutId/update` {name?, data?}, `POST /:layoutId/delete` (soft). `data` = planner export JSON `{version, plan, items[≤500], custom[≤200], walls?[≤400]}`, ≤1 MB, stored as MEDIUMTEXT; server checks the envelope only (client re-sanitises on load). Max 30 layouts/user (400 beyond). uuid public id; owner-scoped. DB: `tb_house_layout` (migration 20261104000000).
- **HOUSE SHARE `/house/share` (JWT) + `/house/view/:token` (public)** (`src/house/HouseShare.*`) — `GET /house/share` (own links: token, name, itemCount, createdAt), `POST /house/share` {name, data} (same validation as layouts; snapshot copy, max 20 links/user, 400 beyond), `POST /house/share/:token/delete` (owner-only soft delete = revoke). `GET /house/view/:token` returns `{name, createdAt, data}` only (never the owner), 404 if missing/revoked. Token = random UUID. DB: `tb_house_share` (migration 20261109000000, NOT run yet).
- **MCP `/mcp`** (`src/mcp/`, PUBLIC — `mw.mcpPublic` = logger + `mcpLimiter`, no auth, no RequestHeaderFilter, no DB) — stateless Streamable HTTP (`enableJsonResponse`, new `McpServer` per POST; GET/DELETE 405). Tools take the planner's layout JSON as an argument (zod-validated: ≤500 items, ≤200 custom, ≤400 walls, ≤1 MB out) and return the edited layout; the user saves it and loads it with the planner's Import JSON. Tools: `new_layout`, `describe_layout`, `check_fit`, `add_furniture` (catalogue kinds + `fitted_wardrobe` generated with parts, `floorToCeiling` = 2.6 m; placed against a room wall via `placeAgainstWall`, refused if it overlaps a wall/item), `move_item`, `remove_item`. `housePlan.ts` is a **server-side copy** of fndom's HDB 5-room walls, room bounds, catalogue sizes, footprint/overlap maths (free-angle `rot`: bounding-box footprint + SAT overlap; `move_item` rot is any 0–360) and wardrobe model — keep in step with fndom `constants/houseplan/*` + `utilities/houseGeometry.ts`. Rooms are hard-coded bounds (`ROOMS`).
- **MCP KEY `/mcp-key`** (JWT, `src/mcp-api-key/`) — `GET|POST|DELETE /api-key` (one active `mcp_` key per user; raw key returned once; sha256 hash + 5-char hint in `tb_mcp_api_key`, migration 20261107000000). Currently unused (the public /mcp needs no key); kept for a future authenticated, saved-layout variant (`mw.mcpKey` was removed — re-add `RequestApiKeyFilter("mcp")`, which still supports the prefix).
- **BUDGET `/budget`** (JWT) — shared budget tables: `GET /`, `POST /`, `GET /:sessionId`, `POST /edit|delete/:sessionId`, items (`POST /:sessionId/item`, `/item/:itemId`, `/item/:itemId/delete|restore`), collaborators (`POST /:sessionId/collaborator`, `/collaborator/:userId/delete`). DB: `tb_budget_table`, `tb_budget_item`, `tb_budget_collaborator`.
- **WEDDING `/wedding`** (frontend `../jessikheng`)
  - `POST /rsvp` — fields: name, email, attending, contactNumber?, dietary?, mealPreference?, `additionalGuestContact[]` (max 10). Strings capped at column widths (name/email 255, dietary/meal 100, message 1000) → 400. Own limiter `weddingRsvpLimiter`: 10 per 15 min per IP. **Keyed by email:** re-submitting an email soft-deletes that email's previous RSVP + guests (and rows where it was a guest) and creates a new row with a new 4-digit PIN. No PIN needed to overwrite (deliberate: every RSVP is also emailed, so an overwritten guest contacts the couple to reconcile). Sends confirmation (with PIN) to submitter and any guest emails. **Tamper alert:** when the submission replaced an earlier RSVP for that email (or a guest entry for it), the submitter's confirmation opens with a red "Your RSVP was updated" notice showing when the earlier response was saved (SGT). Returns `{pin, notice: WEDDING_PDPA_NOTICE}`; auto-increment id never exposed.
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
