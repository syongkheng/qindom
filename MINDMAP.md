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
│   ├── globalLimiter (100 req/min per IP)
│   ├── express.json (5MB)
│   ├── RestRequestLogger (logs all requests; redacts password/blob/token/email;
│   │     console+Telegram by default — TELEGRAM_SILENT_ROUTES list in
│   │     RestRequestLogger.ts skips the Telegram send only for noisy routes
│   │     on success, e.g. POST /iot; still logs to console, still alerts on 4xx/5xx)
│   ├── RequestHeaderFilter (POST must have Content-Type: application/json)
│   ├── cookieParser (reads jwt_token / csrf_token cookies into req.cookies)
│   ├── MandatoryTokenFilter (JWT cookie required → 401 if missing;
│   │     403 csrf_invalid if X-CSRF-Token header doesn't match csrf_token
│   │     cookie on non-GET requests)
│   ├── OptionalTokenFilter (JWT cookie attached if present; same CSRF
│   │     check applies only when a token was actually attached)
│   └── RequestApiKeyFilter (x-api-key header → tb_ss_api_key / tb_llm_api_key lookup,
│         sets logContext.metadata.userId)
│
├── MODULES
│   │
│   ├── AUTH  /api/auth
│   │   ├── Preflight → Register → OTP email → Verify → JWT
│   │   ├── login/verify-email/username-change set the JWT via Set-Cookie
│   │   │     (src/utils/AuthCookieUtilities.ts setAuthCookies) — token
│   │   │     is never present in a JSON response body
│   │   ├── POST /logout — clears jwt_token + csrf_token cookies
│   │   ├── POST /verification — reads the cookie via MandatoryTokenFilter,
│   │   │     no body needed (was: client POSTed token from localStorage)
│   │   ├── GET /admin/request-logs/:requestId (SYSTEM_R5 only) — searches
│   │   │     qindom's own request-log file (src/utils/logging/RequestLogSearch.ts)
│   │   │     for the rendered ASCII tree matching a req_xxxxx Request ID.
│   │   │     Purely read-only: no new table, no redaction changes — the log
│   │   │     text is already redacted at capture time (see RestRequestLogger/
│   │   │     ControllerResponse below). Returns 404 if no match, matches
│   │   │     ordered newest-first, capped at 20.
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
│   │   ├── Max 5 OTP attempts (429 lock)
│   │   ├── Rate limits: 5 reg/hr, 10 login/15min
│   │   └── DB: tb_aa_user
│   │
│   ├── PROFILE  /api/pfp
│   │   ├── Get/update profile, avatar upload
│   │   └── DB: tb_aa_user
│   │
│   ├── ANALYTICS  /api/analytics
│   │   ├── POST /heartbeat — session activity ping (upserted by session_id); requires system field
│   │   ├── POST /event     — ingest structured event (event, properties, page, referrer,
│   │   │                     sessionId, timestamp, system); fire-and-forget from any frontend
│   │   ├── system field identifies source app: 'llm' | 'travel-planner' | 'dental-directory'
│   │   └── DB: tb_analytic_user_activity (+ system col), tb_analytic_event
│   │
│   ├── CONNECTIVITY  /connectivity
│   │   └── Health check (no auth)
│   │
│   ├── ITINERARY  /api/itinerary
│   │   ├── Trip plans (shareable via short_code + 6-char PIN)
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
│   │   └── DB: tb_travel_itinerary, tb_travel_agenda_item,
│   │           tb_travel_agenda_file, tb_travel_itinerary_booking,
│   │           tb_travel_itinerary_view, tb_travel_packing_item,
│   │           tb_travel_note_item
│   │
│   ├── FILE UPLOAD  /api/file  [AUTH REQUIRED]
│   │   ├── Upload base64 files for itinerary items
│   │   └── DB: tb_travel_agenda_file
│   │
│   │
│   ├── GEOCODE  /api/geocode
│   │   ├── GET /api/geocode?q=... — Nominatim (OpenStreetMap) search proxy,
│   │   │     addressdetails=1 (so callers can resolve a destination's
│   │   │     country, e.g. for Suggestion's note lookup)
│   │   ├── Results cached in DB (by normalized query string, no TTL)
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
│   ├── HDB HOUSING  /api/hdb  (Singapore)
│   │   ├── Property search by query
│   │   ├── Nearest properties by coordinates (Haversine)
│   │   └── DB: tb_hdb_pphs, tb_hdb_pphs_coordinate
│   │
│   ├── LTA TRANSPORT  /api/lta  (Singapore)
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
│   ├── DOUYIN  /api/douyin  [AUTH REQUIRED]
│   │   ├── Live stream status check
│   │   ├── Supporter top-up rankings
│   │   ├── Custom SM3 hash + a_bogus token (Evil0ctal port)
│   │   └── Rate limit: 15 req/min
│   │
│   ├── TELEGRAM STORAGE  /api/telegram  [AUTH REQUIRED]
│   │   ├── Link qindom account to Telegram (ephemeral 10-min token)
│   │   ├── Upload / list / delete / expire media via bot
│   │   ├── Stores telegram_file_id only (no binary)
│   │   ├── Telegram Bot: /start /help /link /get /list /delete /expire
│   │   └── DB: tb_telegram_link, tb_telegram_media,
│   │          tb_telegram_link_token
│   │
│   ├── SIRI SHORTCUT (APPLE PAY)  /v1/ss/ap  [API-KEY AUTH]
│   │   ├── "When Apple Pay is used" automation → POST /ap/transaction
│   │   │     { amount, merchant, name } — occurred_dt is stamped server-side
│   │   │     (Date.now()), not trusted from the Shortcut's own date format.
│   │   │     amount accepts "$12.50" or "12.50" (Shortcut sometimes includes
│   │   │     the currency symbol) — leading "$" stripped before Number()
│   │   │     parsing; only the numeric value is ever stored, never the symbol.
│   │   ├── GET /ap/transaction — ApplePay.v1.controller.ts's own list route
│   │   │     (the dashboard instead uses /api/applepay below)
│   │   ├── DB: tb_applepay_transaction — uuid is the public id (see
│   │   │     ApplePayDashboard.controller.ts), category user-assigned via
│   │   │     the dashboard, NULL until then
│   │   └── Auth: RequestApiKeyFilter — x-api-key header, tb_ss_api_key lookup
│   │         (Baby Tracker used to share this same key/route prefix — removed;
│   │         see SS API KEY MGMT below, which the key itself now belongs to
│   │         independent of any one feature)
│   │
│   ├── APPLE PAY DASHBOARD  /api/applepay  [JWT AUTH]
│   │   ├── GET  / — list current user's transactions (ApplePayDashboard.controller.ts)
│   │   ├── POST /:transactionId/category — set/clear category, matched by uuid
│   │   └── Both reuse SsApplePayV1Service (siri-shortcut/ApplePay.v1.service.ts)
│   │
│   ├── SS API KEY MGMT  /api/ss-key  [JWT AUTH]
│   │   ├── GET    /api-key → { hasKey, name, createdDt } (hash never exposed)
│   │   ├── POST   /api-key → revokes existing, generates new ss_ key, returns { key }
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
│   └── IOT API KEY MGMT  /api/iot-key  [JWT AUTH]
│       ├── GET    /api-key → { hasKey, name, createdDt, keyHint }
│       ├── POST   /api-key { deviceName } → revokes existing, generates new iot_ key, returns { key }
│       ├── DELETE /api-key → soft-deletes active key (record_status D)
│       └── DB: tb_iot_api_key
│
│   ├── SUGGESTION  /api/suggestion
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
│   │   │     dietaryRestrictions?, mealPreference?, additionalGuestContact[]
│   │   │     Duplicate email guard (400 on re-submit)
│   │   └── DB: tb_wedding_rsvp, tb_wedding_rsvp_guest
│   │
│   └── GARMIN HEALTH  /api/garmin  [JWT AUTH]
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
│   ├── Douyin webcast API — SM3/a_bogus auth
│   ├── Telegram Bot API — polling/webhook (node-telegram-bot-api ^1.1.0,
│   │     ESM-only, fetch-based client — no longer pulls in `request`)
│   ├── Discord.js Bot
│   ├── Nodemailer (OTP email delivery)
│   └── Garmin Connect (unofficial, via `garmin-connect` npm lib) — GARMIN_EMAIL/
│         GARMIN_PASSWORD env vars; polled by node-cron (see GARMIN module)
│
├── KEY DB PATTERNS
│   ├── Soft delete: record_status 'A'/'D'
│   ├── Timestamps: ms epoch (Date.now())
│   ├── JSON fields: roles[], pax_names, etc. stored as strings
│   ├── Audit: created_by / updated_by (username)
│   └── Username uniqueness: composite index username_system
│
├── MODELS  src/models/
│   ├── IDecodedTokenUser.ts — JWT payload shape (used by auth middleware, requestUtils)
│   ├── IRequestLogContext.ts — request log context shape
│   ├── databases/ — DB row interfaces (ITB_* / ITb*)
│   │   ├── tb_aa_user, tb_scenic_*, tb_trail_*, tb_travel_*, etc.
│   │   ├── tb_telegram_media, tb_telegram_link, tb_telegram_link_token
│   │   ├── tb_tg_image, tb_tg_stats_whitelist
│   │   ├── tb_applepay_transaction, tb_ss_api_key
│   │   ├── tb_wedding_rsvp, tb_wedding_rsvp_guest
│   │   ├── tb_garmin_session, tb_garmin_intraday_metric, tb_garmin_daily_summary
│   │   └── tb_place_cache, tb_suggestion_note, tb_travel_note_item
│   ├── dtos/ — service response shapes (XyzDto suffix)
│   │   ├── DouyinDto.ts — DouyinRankUser
│   │   ├── SleepDto.ts — SleepLogDto
│   │   ├── ScenicDto.ts — ScenicSpotDto, ScenicCheckDto
│   │   ├── TelegramDto.ts — MediaType, MediaDto, LinkTokenDto, MediaUrlDto
│   │   └── GarminDto.ts — TodayDto, DailySummaryDto, SleepDto, HighStressWindow
│   ├── requests/ — request body shapes (XyzBody suffix)
│   │   ├── RequestWithUserInfo.ts — Express Request + user field
│   │   ├── RequestWithLogContext.ts
│   │   └── SleepBody.ts — CreateSleepLogBody
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
