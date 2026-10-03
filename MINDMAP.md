# qindom — Project Mindmap

```
qindom (Express 5 + TypeScript + MySQL)
│
├── INFRASTRUCTURE
│   ├── Runtime: Node 22 / TypeScript 5.9.3
│   ├── Module system: native ESM (package.json "type": "module";
│   │     tsconfig "module"/"moduleResolution": "nodenext")
│   │     — migrated Jun 2026 from CommonJS to unblock node-telegram-bot-api 1.x
│   │     (ESM-only) and drop the `request`-based SSRF advisory chain
│   │     — all relative imports require explicit .js extensions in source
│   │     — dev runner: tsx watch (replaced ts-node + nodemon)
│   │     — Knex CLI scripts run via `node --import tsx ...` (knexfile.ts ESM fix)
│   │     — __dirname/__filename sites use fileURLToPath(import.meta.url)
│   ├── Framework: Express 5.1.0
│   ├── Database: MySQL (db: wuxi) via Knex.js
│   ├── Auth: JWT (30-day, httpOnly cookie `jwt_token`) + double-submit
│   │     CSRF cookie `csrf_token` (readable, echoed as X-CSRF-Token
│   │     header on mutating requests) — see MandatoryTokenFilter /
│   │     OptionalTokenFilter in src/middlewares/TokenFilter.ts
│   ├── Deploy: AWS EC2 ap-southeast-1 — port 3000
│   └── Process manager: PM2 (ecosystem.config.cjs — .cjs since root is now ESM)
│
├── MIDDLEWARE STACK (global → route-level)
│   ├── CORS (ALLOWED_ORIGINS env var)
│   ├── globalLimiter (100 req/min per IP) — all limiters in RateLimiter.ts key
│   │     on X-Real-IP (set by nginx) via clientIpKey + ipKeyGenerator, not
│   │     req.ip (no trust proxy, so req.ip would be nginx's address)
│   ├── express.json (5MB)
│   ├── Two render modes (LoggingUtilities.request): VERBOSE (console + request-
│   │     log file → Log Searcher) has payload, every event, response body, and
│   │     for 500s the real exception + trimmed stack; COMPACT (Telegram) is one
│   │     access-log line — `ip - - [dd/Mon/yyyy HH:MM:SS] "METHOD /path
│   │     HTTP/1.1" status -` — plus a "View Verbose Logs" link to fndom
│   │     /admin/log-searcher?requestId=… (awense.com in prd; in dev the
│   │     localhost URL is shown tap-to-copy, since Telegram won't link it).
│   │     Successful (<400) response bodies are summarised before logging
│   │     (arrays >3 items → "[N items]", strings >300 chars trimmed, depth 5,
│   │     40-line cap); 4xx/5xx bodies are kept verbatim. RequestHeaderFilter
│   │     only adds its "General headers" event when a check fails.
│   │     Pipeline stages: every event carries stage middleware | controller |
│   │     service. RestRequestLogger starts the context in "middleware";
│   │     index.ts appends `enterController` after each route's middlewares
│   │     to flip it to "controller"; after that, service-type events (AUTH,
│   │     SERVICE, SQL, …) are "service", the rest "controller". Filters
│   │     mounted inside routers use request.middleware() to stay tagged as
│   │     middleware. render() writes "│ ── <stage>" markers on change;
│   │     RequestLogParser reads them (and infers stage for older entries) →
│   │     fndom Log Searcher shows Request → Middleware → Controller →
│   │     Service → Response.
│   │     handleException → cr.ko(fallback, { source, error }) →
│   │     request.exception() records the real cause (client still gets fallback)
│   ├── Redaction (src/utils/logging/LogRedaction.ts) — by field name across
│   │     the whole object (payloads, GET query + URL query string, response
│   │     bodies, SQL find() where-clauses): passwords, token/jwt/secret,
│   │     apiKey/api_key_hash, verify_code/otp/pin/captcha_code, smsBody (kept
│   │     as "[REDACTED n chars]"), authorization/cookie, blob; `code` only when
│   │     OTP-shaped (4–8 digits), `key` only when API-key-shaped (ss_/iot_ or
│   │     ≥16 chars); emails masked. Free-text (error messages) gets a regex pass.
│   ├── RestRequestLogger (logs all requests; redaction per LogRedaction.ts;
│   │     console+Telegram by default — TWO independent mechanisms can skip the
│   │     Telegram send only (console/request-log file always unaffected),
│   │     both only ever suppress non-error traffic (4xx/5xx always alert):
│   │       1. TELEGRAM_SILENT_ROUTES — hardcoded {method,path} exact-match
│   │          list in RestRequestLogger.ts (e.g. POST /iot), edited in code.
│   │       2. Per-(chat,module) DB toggle — fans out to EVERY subscribed chat
│   │          (every tb_tg_stats_whitelist row with an active telegram_chat_id —
│   │          each whitelisted admin captures their own chat_id the moment they
│   │          DM the bot /start, see TgLog.bot.ts's initTgLogBot() (started
│   │          in index.ts's app.listen callback) — NOT just "the first" one;
│   │          that single-pick behavior, TgImageService.getStorageChatId(),
│   │          stays but is now only used by the unrelated CDN-upload flow.
│   │          /start also replies with contact info (yongkhengs@gmail.com)
│   │          for both whitelisted admins (fine-tune alerts) and rejected
│   │          users (request access, quoting their Telegram user ID).
│   │          TelegramLogSubscriptionService checks (chat_id, module_key) in
│   │          tb_telegram_log_subscription per chat; module_key resolved via
│   │          TelegramLogModules.ts's resolveModuleKey() (prefix match against
│   │          the same route table as index.ts's mounts). A chat's own toggle
│   │          only ever suppresses that chat's view of non-error traffic for
│   │          that module — errors/unmapped routes always broadcast to every
│   │          subscribed chat. LoggingUtilities.logSender is (text, chatId) =>
│   │          void now (was a single-chat closure) — flush() calls it once per
│   │          resolved target chat id. Admin-editable via fndom's matrix page
│   │          at /admin/telegram-log-subscriptions (GET returns the full
│   │          chat×module matrix; POST /:chatId/:moduleKey toggles one cell,
│   │          SYSTEM_R5 only). 30s in-memory cache on both the subscribed-chats
│   │          list and each (chat,module) enabled-check.
│   ├── RequestHeaderFilter (POST must have Content-Type: application/json)
│   ├── cookieParser (reads jwt_token / csrf_token cookies into req.cookies)
│   ├── JWTs are signed and verified with algorithm pinned to HS256
│   ├── MandatoryTokenFilter (JWT cookie required → 401 if missing;
│   │     403 csrf_invalid if X-CSRF-Token header doesn't match csrf_token
│   │     cookie on non-GET requests)
│   ├── OptionalTokenFilter (JWT cookie attached if present; now also does the
│   │     same DB token-revocation check as MandatoryTokenFilter — a revoked/
│   │     rotated token drops to visitor instead of 401; CSRF enforced only
│   │     when a valid token is attached)
│   └── RequestApiKeyFilter(...prefixes) — factory; x-api-key header →
│         tb_ss_api_key / tb_iot_api_key lookup, sets logContext.metadata.userId.
│         Each route names the key prefix it accepts (presets mw.ssKey →
│         /v1/ss, /v2/ss; mw.iotKey → /iot) so an iot_ device key can't post
│         Apple Pay transactions. Itinerary routes are JWT-only
│         (MandatoryTokenFilter) — their old API-key path never set req.user,
│         so getUser() always 401'd; TokenOrApiKeyFilter.ts is now unused.
│
├── MODULES
│   │
│   ├── AUTH  /auth
│   │   ├── Preflight → Register → OTP email → Verify → JWT
│   │   ├── login/verify-email/username-change set the JWT via Set-Cookie
│   │   │     (src/utils/AuthCookieUtilities.ts setAuthCookies) — token
│   │   │     is never present in a JSON response body
│   │   ├── POST /logout — clears jwt_token + csrf_token cookies
│   │   ├── POST /verification — reads the cookie via MandatoryTokenFilter,
│   │   │     no body needed (was: client POSTed token from localStorage)
│   │   ├── GET /admin/recent-request-logs?limit=3 (SYSTEM_R5 only) — newest N
│   │   │     requests overall (RequestLogSearch.recent()), lightweight
│   │   │     RecentRequestLogDto (requestId/timestamp/method/path/statusCode,
│   │   │     no raw tree) for the dashboard's LogSearchCard widget and the Log
│   │   │     Searcher's "Latest requests" list. Registered before the
│   │   │     :requestId route below (distinct path segment, no ambiguity).
│   │   ├── GET /admin/request-logs/:requestId (SYSTEM_R5 only) — searches
│   │   │     qindom's own request-log file (src/utils/logging/RequestLogSearch.ts)
│   │   │     for the rendered ASCII tree matching a Request ID — req_ + 12 hex
│   │   │     (since Oct 2026; older log files still have 5-hex ids, both
│   │   │     formats accepted here and in fndom's Log Searcher/LogSearchCard).
│   │   │     Purely read-only: no new table, no redaction changes — the log
│   │   │     text is already redacted at capture time (see RestRequestLogger/
│   │   │     ControllerResponse below). Returns 404 if no match, matches
│   │   │     ordered newest-first, capped at 20. Each match (RequestLogMatchDto,
│   │   │     src/models/dtos/RequestLogDto.ts) carries `raw` plus `entry` — the
│   │   │     text parsed back into structure by RequestLogParser.ts (header,
│   │   │     events w/ lines/timings/stack, status + reason phrase, payload and
│   │   │     response JSON text); `entry` is null if unparseable and fndom
│   │   │     falls back to raw. Parser must track LoggingUtilities.render().
│   │   │     Log source: LoggingUtilities.request.flush() writes the same
│   │   │     rendered lines it console.logs to a dedicated file via
│   │   │     RequestLogFileWriter.ts — deliberately NOT reading PM2's
│   │   │     qindom.out.log, since that only exists in prod (PM2 captures
│   │   │     stdout there) and is empty/absent when running `npm run dev`
│   │   │     (tsx watch just prints to the terminal, nothing captures it to
│   │   │     a file). RequestLogFileWriter picks its own directory —
│   │   │     /home/ubuntu/.pm2/logs/qindom-request-tree.log in prod (NODE_ENV
│   │   │     "prd"), ./logs/qindom-request-tree.log (gitignored) in dev — so
│   │   │     search works identically in both environments. 50MB rotation,
│   │   │     best-effort (try/catch, never blocks the response).
│   │   ├── bcrypt (10 rounds), SHA-256 OTP hash, 15-min TTL
│   │   ├── Emails (OTP, password-changed) HTML-escape the username via
│   │   │     MailerUtilities.escapeHtml; usernames are 3–64 chars (register
│   │   │     + /pfp/user/username)
│   │   ├── Dev OTP bypass: verifyEmail() accepts code "111111" whenever
│   │   │     NODE_ENV !== "prd", regardless of the real DB-stored code,
│   │   │     expiry, or attempt count — lets fndom's dev build skip
│   │   │     sending real verification emails (see fndom's
│   │   │     handleResendCode / LoginView.vue verify-step watcher,
│   │   │     which skip the RESEND_VERIFY call and show a "use 111111"
│   │   │     hint instead, only when import.meta.env.DEV)
│   │   ├── Max 5 OTP attempts (429 lock)
│   │   ├── Rate limits: 5 reg/hr, 10 login/15min
│   │   └── DB: tb_aa_user
│   │
│   ├── PROFILE  /pfp
│   │   ├── Get/update profile, avatar upload
│   │   └── DB: tb_aa_user
│   │
│   ├── ANALYTICS  /analytics
│   │   ├── POST /heartbeat — session activity ping (upserted by session_id); requires system field
│   │   ├── POST /event     — ingest structured event (event, properties, page, referrer,
│   │   │                     sessionId, timestamp, system); fire-and-forget from any frontend
│   │   ├── system field identifies source app: 'travel-planner' | 'dental-directory'
│   │   └── DB: tb_analytic_user_activity (+ system col), tb_analytic_event
│   │
│   ├── CONNECTIVITY  /connectivity
│   │   └── Health check (no auth)
│   │
│   ├── ITINERARY  /itinerary
│   │   ├── Trip plans (shareable via short_code + 6-char PIN)
│   │   ├── POST /challenge rate-limited: itineraryChallengeLimiter, 10 failed
│   │   │     attempts/15min per IP (skipSuccessfulRequests — unlocks don't count)
│   │   ├── Agenda items (flights, hotels, activities) — day/date nullable +
│   │   │     unknown_time flag, so an item can be an unscheduled "thing to
│   │   │     do"/"place to visit" (see fndom TravelPlannerView); assigning
│   │   │     a date later just updates the row. `list_type` ('todo'|'place',
│   │   │     nullable) discriminates the two — both can carry coordinates
│   │   │     (Things-to-do gets client-side geocoded for map display too),
│   │   │     so coordinate-presence alone can't tell them apart
│   │   ├── Note items — tb_travel_note_item (per-trip checklist, mirrors
│   │   │     packing_item shape: label/category/url/done/sort_order),
│   │   │     bulk create/edit alongside agendaItems/bookings/packingItems
│   │   ├── File attachments (base64, 5MB) — auth required
│   │   ├── POST /edit/:sessionId — child rows (agenda/booking/packing/note)
│   │   │     are addressed by client-supplied ids, so every update/delete is
│   │   │     scoped with itinerary_id; an agendaItems[].id not owned by the
│   │   │     itinerary → ForbiddenAccess (rolls back the whole edit). Keep
│   │   │     this scoping on any new child-table write (was a cross-user IDOR)
│   │   └── DB: tb_travel_itinerary, tb_travel_agenda_item,
│   │           tb_travel_agenda_file, tb_travel_itinerary_booking,
│   │           tb_travel_itinerary_view, tb_travel_packing_item,
│   │           tb_travel_note_item
│   │
│   ├── FILE UPLOAD  /file  [AUTH REQUIRED]
│   │   ├── Upload base64 files for itinerary items
│   │   └── DB: tb_travel_agenda_file
│   │
│   │
│   ├── GEOCODE  /geocode
│   │   ├── GET /geocode?q=... — Nominatim (OpenStreetMap) search proxy,
│   │   │     addressdetails=1 (so callers can resolve a destination's
│   │   │     country, e.g. for Suggestion's note lookup)
│   │   ├── Results cached in DB (by normalized query string, no TTL);
│   │   │     failed upstream fetches are NOT cached (would stick forever)
│   │   ├── Public, so cache misses go through a module-level Nominatim queue
│   │   │     in Geocode.service.ts: ≥1.1s between calls (Nominatim 1 req/s
│   │   │     policy), max 5 waiting — beyond that → ExternalRequest error.
│   │   │     q capped at 200 chars.
│   │   └── DB: tb_geocode_cache
│   │
│   ├── PLACES  /api/places
│   │   ├── GET /api/places?destination=... — public; resolves destination
│   │   │     via GeocodeService, then queries OpenStreetMap Overpass API
│   │   │     (tourism/leisure/historic tagged POIs within 3km) — free, no
│   │   │     API key, same ecosystem as Geocode's Nominatim use
│   │   ├── Merges in admin-curated places (SuggestionService.getPlacesByDestination,
│   │   │     tb_suggestion_place — same fuzzy destination_tag match as
│   │   │     activities) — curated rows carry id/description/images and
│   │   │     win on exact-title collision with a live Overpass hit; not
│   │   │     affected by the Overpass response cache, so admin edits via
│   │   │     /admin/suggestions (fndom) show up immediately
│   │   ├── Maps raw OSM tags onto the app's category vocabulary
│   │   │     (attraction/entertainment/nature/other) via
│   │   │     OVERPASS_TAG_TO_CATEGORY in Places.service.ts
│   │   ├── Results cached by rounded lat/lng + radius (no TTL) — Overpass
│   │   │     portion only; curated merge happens after the cache read
│   │   └── DB: tb_place_cache
│   │
│   ├── HDB HOUSING  /hdb  (Singapore)
│   │   ├── Property search by query
│   │   ├── Nearest properties by coordinates (Haversine)
│   │   ├── Coordinate admin endpoints — /pphs/update, /pphs/clear-coordinates,
│   │   │     /pphs/geocode-options, /pphs/refresh — all MandatoryTokenFilter +
│   │   │     PPHS_R5|SYSTEM_R5 (options/refresh call OneMap+Nominatim
│   │   │     uncached, and refresh deletes admin-curated coordinates)
│   │   └── DB: tb_hdb_pphs, tb_hdb_pphs_coordinate
│   │
│   ├── LTA TRANSPORT  /lta  (Singapore)
│   │   ├── Bus arrival timings (LTA DataMall API)
│   │   ├── Nearest bus stops / MRT stations
│   │   └── DB: tb_lta_busstop, tb_lta_bus_info, tb_lrt_mrt_station
│   │
│   ├── FND / KINGDOM 236
│   │   └── Discord Bot (prefix !)
│   │       ├── Commands: hello, ping, help, register, deregister,
│   │       │             list, redeem, remind, stalk
│   │       ├── Auto gift-code watcher: monitors GIFT_CODE_WATCH_CHANNEL_IDS
│   │       │   for "Gift Code: `CODE`" pattern (bots/webhooks included),
│   │       │   extracts code and calls executeRedemption() automatically,
│   │       │   posts results to PRD #secretary channel
│   │       └── Discord user ↔ governor ID via Firestore
│   │
│   ├── TELEGRAM STORAGE  /api/telegram  [AUTH REQUIRED]
│   │   ├── Link qindom account to Telegram (ephemeral 10-min token)
│   │   ├── Upload / list / delete / expire media via bot
│   │   ├── Stores telegram_file_id only (no binary)
│   │   ├── Telegram Bot: /start /help /link /get /list /delete /expire
│   │   └── DB: tb_telegram_link, tb_telegram_media,
│   │          tb_telegram_link_token
│   │
│   ├── IMAGE CDN  /img  (src/tgimage/TgImage.*)
│   │   ├── POST /upload [JWT] — multer 30MB in memory → Telegram sendDocument
│   │   │     to the storage chat; returns 8-hex shortCode (tb_tg_image)
│   │   ├── GET /:shortCode [public] — streams from Telegram, re-encoded by
│   │   │     sharp; sent with CSP `default-src 'none'; sandbox`
│   │   ├── SVG is NEVER stored or served raw: rasterised to PNG on upload,
│   │   │     and legacy SVG rows rasterised on read — /img is on the API
│   │   │     origin, so a scripted SVG would read csrf_token + ride jwt_token
│   │   └── /admin/list|add|remove (SYSTEM_R5) — tb_tg_stats_whitelist
│   │
│   ├── SIRI SHORTCUT (APPLE PAY) V1  /v1/ss/ap  [API-KEY AUTH]
│   │   ├── "When Apple Pay is used" automation → POST /ap/transaction
│   │   │     { amount, merchant, name } — occurred_dt is stamped server-side
│   │   │     (Date.now()), not trusted from the Shortcut's own date format.
│   │   │     amount accepts "$12.50" or "12.50" (Shortcut sometimes includes
│   │   │     the currency symbol) — leading "$" stripped before Number()
│   │   │     parsing; only the numeric value is ever stored, never the symbol.
│   │   │     NFC taps only. Kept fully intact (not removed) even though the
│   │   │     automation itself may be disabled device-side in favor of V2 —
│   │   │     see V2 below.
│   │   ├── GET /ap/transaction — ApplePay.v1.controller.ts's own list route
│   │   │     (the dashboard instead uses /applepay below)
│   │   ├── DB: tb_applepay_transaction — uuid is the public id (see
│   │   │     ApplePayDashboard.controller.ts), category user-assigned via
│   │   │     the dashboard, NULL until then; source col defaults 'v1'
│   │   └── Auth: RequestApiKeyFilter — x-api-key header, tb_ss_api_key lookup
│   │         (Baby Tracker used to share this same key/route prefix — removed;
│   │         see SS API KEY MGMT below, which the key itself now belongs to
│   │         independent of any one feature)
│   │
│   ├── SIRI SHORTCUT (BANK SMS) V2  /v2/ss/ap  [API-KEY AUTH]
│   │   ├── POST /ap/sms { smsBody } — fed by a Shortcut automation
│   │   │     that forwards the raw text of any bank transaction-alert
│   │   │     SMS as-is (not just Apple Pay/NFC — covers online
│   │   │     transactions too). ApplePay.v2.controller.ts regex-parses
│   │   │     amount (currency code + 2dp), merchant (text after "at "/
│   │   │     "to ", before the "If unauthorised" boilerplate, a trailing
│   │   │     date, "was completed", or end of string — handles both UOB-
│   │   │     and DBS-style alerts), and card last 3-4 digits ("Card
│   │   │     ending NNNN", best-effort) out of the SMS body; occurred_dt
│   │   │     stamped server-side same as V1
│   │   ├── DB: tb_applepay_transaction — same table as V1, source='v2',
│   │   │     card_last4 set, name NULL (no Apple Pay device name to report)
│   │   └── Auth: same RequestApiKeyFilter / tb_ss_api_key as V1
│   │
│   ├── APPLE PAY DASHBOARD  /applepay  [JWT AUTH]
│   │   ├── GET  / — list current user's transactions from both V1 and V2
│   │   │     (single combined feed; UI shows a source badge NFC/SMS and
│   │   │     either the device name, a user-set card label, or the raw
│   │   │     "•• NNNN" card last4 per row) — ApplePayDashboard.controller.ts
│   │   ├── POST / { amount, merchant, occurredDt, category? } — manual entry
│   │   │     (cash / missed alerts), source='manual', user-supplied
│   │   │     occurred_dt (future dates rejected, 5-min skew allowed)
│   │   ├── POST /:transactionId/delete — soft delete (record_status 'D'),
│   │   │     scoped to the owner; used for duplicates/refunds (POST, not
│   │   │     DELETE, by choice — matches /:transactionId/category). Duplicate detection
│   │   │     (v1 tap + v2 SMS, same amount, ≤10 min apart) and CSV export are
│   │   │     frontend-only in fndom's ApplePayDashboardView
│   │   ├── POST /:transactionId/category — set/clear category, matched by uuid
│   │   ├── POST /card-label/:cardLast4 { label } — set/clear the user's
│   │   │     nickname for a V2 card (e.g. "5244" → "DBS Debit"); applies to
│   │   │     every transaction row sharing that card_last4, not just one
│   │   ├── DB: tb_applepay_card_label — one row per (user, card_last4);
│   │   │     null/empty label deletes the row rather than storing empty
│   │   └── Both V1/V2 ingestion and the dashboard reuse SsApplePayV1Service
│   │         (siri-shortcut/ApplePay.v1.service.ts) — recordTransaction (V1)
│   │         vs recordSmsTransaction (V2), shared getTransactions/updateCategory/
│   │         setCardLabel
│   │
│   ├── SS API KEY MGMT  /ss-key  [JWT AUTH]
│   │   ├── GET    /api-key → { hasKey, name, createdDt, keyHint } (hash never exposed)
│   │   ├── POST   /api-key → revokes existing, generates new ss_ key, returns { key }
│   │   │     (new keys default name="Siri Shortcuts"; old Baby Tracker-era
│   │   │     keys may still say "Baby Tracker" until renamed)
│   │   ├── POST   /api-key/name { name } → renames the active key's label
│   │   │     only (key value/hash untouched, so it never breaks an
│   │   │     already-configured Shortcut automation) — SsApiKey.validator.ts
│   │   │     caps name at 100 chars to match the DB column
│   │   ├── DELETE /api-key → soft-deletes active key (record_status D)
│   │   ├── DB: tb_ss_api_key — one active "ss_" key per user, generic across
│   │   │     whichever Siri Shortcut integration uses it (currently Apple Pay
│   │   │     only; previously also Baby Tracker, removed — src/ss-api-key/,
│   │   │     was src/baby/BabyApiKey.* before the rename)
│   │   └── Not to be confused with /v1/ss/ap above — that's the Shortcut
│   │         presenting the key; this is the authenticated dashboard managing it
│   │
│   ├── IOT DEVICES  /iot  [API-KEY AUTH]
│   │   ├── POST /iot — body { deviceId, deviceName?, lat?, lon?, alt?, temp?,
│   │   │     recordedAt?, meta?: {rssi, chipTemp, uptimeMs} }
│   │   │       ├── upserts last-seen status — DB: tb_iot_device_heartbeat
│   │   │       └── inserts one coordinate-log row per request (path history)
│   │   │             — DB: tb_iot_coordinate_log (recorded_dt = device-clock
│   │   │             capture time in ms, converted from recordedAt seconds if
│   │   │             given, else server receipt time; created_dt = insert time)
│   │   ├── GET  /iot?deviceId=... — last-seen status for a device
│   │   ├── GET  /iot/history?deviceId=...&limit=... — recent coordinate log rows,
│   │   │     newest first (default limit 50) — for future path-map plotting
│   │   └── Auth: RequestApiKeyFilter — x-api-key header, tb_iot_api_key lookup
│   │           (built for the hike-hitcher ESP32 + SSD1306 OLED hiking tracker)
│   │
│   └── IOT API KEY MGMT  /iot-key  [JWT AUTH]
│       ├── GET    /api-key → { hasKey, name, createdDt, keyHint }
│       ├── POST   /api-key { deviceName } → revokes existing, generates new iot_ key, returns { key }
│       ├── DELETE /api-key → soft-deletes active key (record_status D)
│       └── DB: tb_iot_api_key
│
│   ├── SUGGESTION  /suggestion
│   │   ├── GET  /activity?destination=... — fuzzy search (LOWER LIKE), public
│   │   ├── POST /activity, PUT /activity/:id — admin-only (JWT + role "admin")
│   │   ├── DELETE /activity/:id — admin-only
│   │   ├── GET  /activity/admin/list — admin-only; full catalogue (incl.
│   │   │     images) for the fndom /admin/suggestions management UI
│   │   ├── GET  /packing — all active packing suggestions, public
│   │   ├── POST /packing — admin-only
│   │   ├── DELETE /packing/:id — admin-only
│   │   ├── GET  /note?country=... — exact (case-insensitive) match, public;
│   │   │     pre-trip reminders (e.g. arrival cards) — link + deadline copy
│   │   │     only, never an integration that submits anything for the user
│   │   ├── POST /note — admin-only
│   │   ├── DELETE /note/:id — admin-only
│   │   ├── GET  /place?destination=... — curated-only, fuzzy match, public
│   │   │     (the live-merged view used by the map is /api/places, not this)
│   │   ├── POST /place, PUT /place/:id, DELETE /place/:id — admin-only
│   │   ├── GET  /place/admin/list — admin-only; full catalogue for the
│   │   │     fndom /admin/suggestions management UI
│   │   └── DB: tb_suggestion_activity (destination_tag, category, estimated_hours,
│   │             images_json — string[] image URLs, admin-editable)
│   │           tb_suggestion_packing (trip_type, label, category)
│   │           tb_suggestion_note (country, mandatory, min_days_before_arrival,
│   │             max_advance_hours — seeded: SG Arrival Card, Thailand TDAC,
│   │             Japan Visit Japan Web)
│   │           tb_suggestion_place (destination_tag, title, category, description,
│   │             images_json, lat, lng — admin-curated "places to visit",
│   │             merged into /api/places alongside live Overpass results)
│   │       Seeded with 18 Singapore activities + 15 general/city packing items
│   │
│   ├── WEDDING  /api/wedding
│   │   ├── POST /rsvp — self-service guest RSVP (OptionalTokenFilter)
│   │   │     Fields: name, email, attending (bool), contactNumber?,
│   │   │     dietaryRestrictions?, mealPreference?, additionalGuestContact[],
│   │   │     pin? — a name matching an existing RSVP (case-insensitive) UPDATES
│   │   │     it, but only with that RSVP's pin in the body; missing/wrong pin
│   │   │     → 403 forbidden_access (was an unauthenticated overwrite that
│   │   │     also returned the pin). jessikheng sends the pin it verified via
│   │   │     GET /rsvp (RSVPModal verifiedPin).
│   │   │     Response includes WEDDING_PDPA_NOTICE (retention notice)
│   │   ├── POST /rsvp/preflight {name} — step-1 existence check for the form;
│   │   │     returns {exists, hasEmail} booleans only (no PII).
│   │   │     Service: checkRsvpExistsByName().
│   │   ├── POST /rsvp/recover-pin {name} — "forgot PIN": emails the pin to the
│   │   │     registered address; returns {exists, hasEmail, sent}, never the pin.
│   │   │     Service: recoverPinByName().
│   │   ├── GET /rsvp?name=&pin= — LOCKED-DOWN lookup: requires BOTH name and
│   │   │     the 4-digit pin. Returns only the requester's OWN details +
│   │   │     whose RSVP they're on (role primary|guest, guestOf) — never other
│   │   │     guests' details. For a PRIMARY match, also returns guestNames[]
│   │   │     (own guest names, for edit pre-fill). Mismatch → plain not-found.
│   │   │     Service: lookupRsvpByNameAndPin() / RsvpSelfView.
│   │   ├── GET /rsvp/status?name=&pin= — status check now requires BOTH name
│   │   │     and pin (name must be on that pin's RSVP); pin-alone / name-alone
│   │   │     removed. Returned names stay PDPA-masked via
│   │   │     src/utils/MaskingUtilities.ts (maskName; last 3/2/1 chars → '*').
│   │   │     Service: findRsvpStatusByNameAndPin().
│   │   │     Frontend: jessikheng (../jessikheng) RsvpStatusPage — two fields;
│   │   │     /#/status/:pin deep-link pre-fills pin only, no auto-run.
│   │   ├── PDPA: WEDDING_PDPA_NOTICE promises deletion the day after the
│   │   │     wedding — TODO: no purge job yet enforces it (notice only)
│   │   └── DB: tb_wedding_rsvp, tb_wedding_rsvp_guest
│   │
│   └── GARMIN HEALTH  /garmin  [JWT AUTH]
│       ├── GET /today — today's intraday stress/body-battery/heart-rate
│       │     series + last night's sleep (computed live, not persisted)
│       ├── GET /summary?days=N — persisted daily summaries for trend
│       │     charts (default 7, max 90)
│       ├── Garmin.client.ts — wraps unofficial `garmin-connect` npm lib;
│       │     session (oauth1/oauth2) cached in tb_garmin_session so the
│       │     scheduler doesn't log in every poll; stress/body-battery use
│       │     undocumented `wellness-service` endpoints via the lib's
│       │     generic .get() escape hatch — can break if Garmin changes them
│       ├── Garmin.scheduler.ts (node-cron, started in index.ts app.listen)
│       │     ├── */15 * * * * — poll stress/body-battery/HR → intraday row
│       │     └── 0 8 * * * (Asia/Singapore) — pull last night's sleep +
│       │           roll up prior day's intraday polls into a daily summary
│       ├── High stress = score >75 sustained 2+ consecutive polls (15+ min);
│       │     surfaced only as highlighted windows on the fndom dashboard —
│       │     no push notification (see fndom /health, personal/auth-only)
│       └── DB: tb_garmin_session, tb_garmin_intraday_metric,
│              tb_garmin_daily_summary
│
│   DEBUG  /debug  [OPEN in dev · JWT + SYSTEM_R5 in prd]
│   └── GET /status/:code (200–599) — test endpoint for the logging/Telegram
│         pipeline. 500 throws a real Error → handleException (exception +
│         stack in the request tree); other codes are returned directly
│         (4xx status name "debug_<code>"). Telegram module key "debug".
│
│
├── EXTERNAL SERVICES
│   ├── MySQL (wuxi DB)
│   ├── Nominatim (OpenStreetMap geocoding) — unauthenticated, custom
│   │     User-Agent; note the MINDMAP previously said "Google Geocoding
│   │     API" — corrected, the actual implementation has always been
│   │     Nominatim (see GeocodeService.ts)
│   ├── Overpass API (OpenStreetMap POI/places lookup) — unauthenticated,
│   │     custom User-Agent + Accept header (plain fetch without them
│   │     gets HTTP 406 from overpass-api.de)
│   ├── Firebase/Firestore
│   ├── LTA DataMall API (Singapore transport)
│   ├── Telegram Bot API — polling/webhook (node-telegram-bot-api ^1.1.0,
│   │     ESM-only, fetch-based client — no longer pulls in `request`)
│   ├── Discord.js Bot
│   ├── Nodemailer (OTP email delivery)
│   └── Garmin Connect (unofficial, via `garmin-connect` npm lib) — GARMIN_EMAIL/
│         GARMIN_PASSWORD env vars; polled by node-cron (see GARMIN module)
│
├── KEY DB PATTERNS
│   ├── Soft delete: record_status 'A'/'D'
│   ├── UNIQUE keys vs soft delete: never put a plain UNIQUE on a user-chosen
│   │     value (a 'D' row would block a new active one). Either no key, or
│   │     unique among active rows via a VIRTUAL generated column
│   │     `IF(record_status = 'A', col, NULL)` + UNIQUE (NULLs don't collide).
│   │     System-generated ids (uuid, session_id, short_code) stay plain UNIQUE.
│   ├── Timestamps: ms epoch (Date.now())
│   ├── JSON fields: roles[], pax_names, etc. stored as strings
│   ├── Audit: created_by / updated_by (username)
│   └── Username uniqueness: UNIQUE on generated username_system_active (active
│         users only) + plain index on username_system for lookups
│         (migration 20261003000100_fix_soft_delete_unique_keys)
│
├── MODELS  src/models/
│   ├── IDecodedTokenUser.ts — JWT payload shape (used by auth middleware, requestUtils)
│   ├── IRequestLogContext.ts — request log context shape
│   ├── databases/ — DB row interfaces (ITB_* / ITb*)
│   │   ├── tb_aa_user, tb_scenic_*, tb_trail_*, tb_travel_*, etc.
│   │   ├── tb_telegram_media, tb_telegram_link, tb_telegram_link_token
│   │   ├── tb_tg_image, tb_tg_stats_whitelist
│   │   ├── tb_applepay_transaction, tb_applepay_card_label, tb_ss_api_key
│   │   ├── tb_wedding_rsvp, tb_wedding_rsvp_guest
│   │   ├── tb_garmin_session, tb_garmin_intraday_metric, tb_garmin_daily_summary
│   │   └── tb_place_cache, tb_suggestion_note, tb_travel_note_item
│   ├── dtos/ — service response shapes (XyzDto suffix)
│   │   ├── SleepDto.ts — SleepLogDto
│   │   ├── ScenicDto.ts — ScenicSpotDto, ScenicCheckDto
│   │   ├── TelegramDto.ts — MediaType, MediaDto, LinkTokenDto, MediaUrlDto
│   │   └── GarminDto.ts — TodayDto, DailySummaryDto, SleepDto, HighStressWindow
│   ├── requests/ — request body shapes (XyzBody suffix)
│   │   ├── RequestWithUserInfo.ts — Express Request + user field
│   │   ├── RequestWithLogContext.ts
│   │   ├── SleepBody.ts — CreateSleepLogBody
│   │   └── ApplePayBody.ts — CreateManualTransactionBody
│   └── responses/
│       └── ControllerResponse.ts
│
├── CODE CONVENTIONS
│   ├── Response interfaces: XyzDto suffix → src/models/dtos/
│   ├── Request bodies: XyzBody suffix → src/models/requests/
│   ├── DB row interfaces: ITB_* or ITb* → src/models/databases/
│   ├── URLs: hyphens, not underscores
│   ├── Envelope: { code, status: "Ok"/"Ko", data }
│   ├── Controller factory: createXyzController(db) → Router
│   ├── Role guard: hasRole(req, ...roles) from requestUtils — use in controllers for HTTP-layer auth
│   ├── Feature flag gate: check inside service method, throw Exceptions.ForbiddenAccess if off
│   ├── Exceptions: always throw, never return error strings
│   └── Request tree logging pattern:
│       ├── KnexSqlUtilities accepts optional logContext (4th/last param)
│       │     — auto-emits timed SQL events when logContext provided
│       ├── Service methods accept logContext?: IRequestLogContext
│       │     — emit AUTH events via LoggingUtilities.request.branch()
│       │     — use pending-event pattern: branch() returns event ref,
│       │       set .detail after the async result is known
│       └── Controllers pass req.logContext to service calls
│
└── ENVIRONMENTS
    ├── Dev: .env.dev, Telegram polling, port 3000
    └── Prod: .env (NODE_ENV=prd), Telegram webhook, AWS EC2
```

### Exception flow

```
  Service (or Validator) throws a typed exception
          │
          │  all extend BaseExceptions
          ▼
  InvalidRequestException   EntityNotFoundException   ForbiddenAccessException  ...
          │
          │  bubbles up to Controller catch block
          ▼
  handleException(err, cr, label, fallback)     ←  src/utils/requestUtils.ts
          │
          ├─ instanceof BaseExceptions?
          │   └─ YES → cr.result(err.httpStatus, err.name, err.clientMessage)
          │              e.g. 400 / 401 / 403 / 404 with structured JSON
          │
          └─ NO (unexpected error)
              └─ LoggingUtilities.service.error(label, message)
                 cr.ko(fallback)   →  500 with generic fallback message

  All responses use the same envelope:
  { code: <httpStatus>, status: "Ok" | "Ko", data: <payload | error message> }
```
