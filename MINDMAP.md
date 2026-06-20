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
│   ├── Auth: JWT (30-day, Bearer token)
│   ├── Deploy: AWS EC2 ap-southeast-1 — port 3000
│   └── Process manager: PM2 (ecosystem.config.cjs — .cjs since root is now ESM)
│
├── MIDDLEWARE STACK (global → route-level)
│   ├── CORS (ALLOWED_ORIGINS env var)
│   ├── globalLimiter (100 req/min per IP)
│   ├── express.json (5MB)
│   ├── RestRequestLogger (logs all requests; redacts password/blob/token/email)
│   ├── RequestHeaderFilter (POST must have Content-Type: application/json)
│   ├── MandatoryTokenFilter (JWT required → 401 if missing)
│   ├── OptionalTokenFilter (JWT attached if present)
│   └── RequestApiKeyFilter (x-api-key header → tb_ss_api_key / tb_llm_api_key lookup,
│         sets logContext.metadata.userId)
│
├── MODULES
│   │
│   ├── AUTH  /api/auth
│   │   ├── Preflight → Register → OTP email → Verify → JWT
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
│   │   ├── Heartbeat pings (session + IP + user-agent)
│   │   └── DB: tb_analytic_user_activity
│   │
│   ├── CONNECTIVITY  /connectivity
│   │   └── Health check (no auth)
│   │
│   ├── ITINERARY  /api/itinerary
│   │   ├── Trip plans (shareable via short_code + 6-char PIN)
│   │   ├── Agenda items (flights, hotels, activities)
│   │   ├── File attachments (base64, 5MB) — auth required
│   │   └── DB: tb_travel_itinerary, tb_travel_agenda_item,
│   │           tb_travel_agenda_file, tb_travel_itinerary_booking,
│   │           tb_travel_itinerary_view
│   │
│   ├── FILE UPLOAD  /api/file  [AUTH REQUIRED]
│   │   ├── Upload base64 files for itinerary items
│   │   └── DB: tb_travel_agenda_file
│   │
│   │
│   ├── GEOCODE  /api/geocode
│   │   ├── Google Geocoding API wrapper
│   │   ├── Results cached in DB
│   │   └── DB: tb_geocode_cache
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
│   ├── SIRI SHORTCUT (BABY TRACKING)  /v1/ss/baby  [API-KEY AUTH]
│   │   ├── Feeding: POST/GET /baby/feeding — DB: tb_baby_feeding_record
│   │   ├── Diaper:  POST/GET /baby/diaper  — DB: tb_baby_diaper_record
│   │   │     (has_stool/has_urine bool + stool_load/urine_load ENUM
│   │   │      light/medium/heavy; changed_dt = event time, distinct
│   │   │      from created_dt insert-audit time)
│   │   └── Auth: RequestApiKeyFilter — x-api-key header, tb_ss_api_key lookup
│   │
│   └── BABY API KEY MGMT  /api/baby  [JWT AUTH]
│       ├── GET    /api-key → { hasKey, name, createdDt } (hash never exposed)
│       ├── POST   /api-key → revokes existing, generates new ss_ key, returns { key }
│       ├── DELETE /api-key → soft-deletes active key (record_status D)
│       └── DB: tb_ss_api_key (same table as siri-shortcut auth)
│
│
│
├── EXTERNAL SERVICES
│   ├── MySQL (wuxi DB)
│   ├── Google Geocoding API (+ Firebase/Firestore)
│   ├── LTA DataMall API (Singapore transport)
│   ├── Douyin webcast API — SM3/a_bogus auth
│   ├── Telegram Bot API — polling/webhook (node-telegram-bot-api ^1.1.0,
│   │     ESM-only, fetch-based client — no longer pulls in `request`)
│   ├── Discord.js Bot
│   └── Nodemailer (OTP email delivery)
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
│   │   └── tb_baby_feeding_record, tb_baby_diaper_record
│   ├── dtos/ — service response shapes (XyzDto suffix)
│   │   ├── DouyinDto.ts — DouyinRankUser
│   │   ├── SleepDto.ts — SleepLogDto
│   │   ├── ScenicDto.ts — ScenicSpotDto, ScenicCheckDto
│   │   └── TelegramDto.ts — MediaType, MediaDto, LinkTokenDto, MediaUrlDto
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
