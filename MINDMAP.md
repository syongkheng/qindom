# qindom — Project Mindmap

```
qindom (Express 5 + TypeScript + MySQL)
│
├── INFRASTRUCTURE
│   ├── Runtime: Node 22 / TypeScript 5.9.3
│   ├── Framework: Express 5.1.0
│   ├── Database: MySQL (db: wuxi) via Knex.js
│   ├── Auth: JWT (30-day, Bearer token)
│   ├── Deploy: AWS EC2 ap-southeast-1 — port 3000
│   └── Process manager: PM2 (ecosystem.config.js)
│
├── MIDDLEWARE STACK (global → route-level)
│   ├── CORS (ALLOWED_ORIGINS env var)
│   ├── globalLimiter (100 req/min per IP)
│   ├── express.json (5MB)
│   ├── RestRequestLogger (logs all requests; redacts password/blob/token/email)
│   ├── RequestHeaderFilter (POST must have Content-Type: application/json)
│   ├── MandatoryTokenFilter (JWT required → 401 if missing)
│   └── OptionalTokenFilter (JWT attached if present)
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
│   ├── EXPENSE TRACKER  /api/expense  [AUTH REQUIRED]
│   │   ├── Transactions (income/expense)
│   │   ├── Credit card management (cycle/due day)
│   │   ├── Balance tracking (upserted)
│   │   └── DB: tb_expense_transaction, tb_expense_card,
│   │           tb_expense_balance
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
│   │           tb_telegram_link_token
│   │
│   └── LLM MARKETPLACE  /api/marketplace  [AUTH REQUIRED]
│       ├── Wallet: get balance, mock top-up (cash in cents)
│       │   └── TODO: real payment gateway (Stripe/PayNow)
│       ├── API Key: per-user internal API key (32-byte hex), rotate
│       │   └── TODO: X-API-Key header auth middleware, per-token billing
│       ├── Chat: POST /chat (mock replies per model), session history
│       │   └── TODO: real Anthropic/OpenAI/Google SDK call, provider key cycling
│       ├── Sessions: list / get messages / soft-delete
│       └── DB: tb_marketplace_wallet, tb_marketplace_topup,
│               tb_marketplace_api_key, tb_marketplace_session,
│               tb_marketplace_message, tb_marketplace_provider_key
│   

│
├── EXTERNAL SERVICES
│   ├── MySQL (wuxi DB)
│   ├── Google Geocoding API (+ Firebase/Firestore)
│   ├── LTA DataMall API (Singapore transport)
│   ├── Douyin webcast API — SM3/a_bogus auth
│   ├── Telegram Bot API — polling/webhook
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
│   │   └── tb_tg_image, tb_tg_stats_whitelist
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

---

## LAYER ARCHITECTURE

### Request flow across all three systems

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           QINDOM — THREE ENTRY SYSTEMS                           │
│                                                                                  │
│  ① REST API                ② Telegram Bot           ③ Discord Bot               │
│  HTTP Clients              polling / webhook         prefix ! cmds               │
└───────────┬──────────────────────────┬───────────────────────┬───────────────────┘
            │                          │                        │
            ▼                          │                        │
┌───────────────────────┐              │                        │
│    MIDDLEWARE STACK    │              │                        │
│  (applied per-route)  │              │                        │
│                       │              │                        │
│  RestRequestLogger    │              │                        │
│  RequestHeaderFilter  │              │                        │
│  RateLimiter          │              │                        │
│  MandatoryToken /     │              │                        │
│  OptionalTokenFilter  │              │                        │
└───────────┬───────────┘              │                        │
            │                          │                        │
            ▼                          ▼                        ▼
┌───────────────────────┐  ┌───────────────────────┐  ┌──────────────────────┐
│      CONTROLLER        │  │     BOT HANDLER        │  │   DISCORD COMMAND    │
│   createXyzController  │  │  Telegram.bot.ts       │  │   *.command.ts       │
│   returns Router       │  │  TgImage.bot.ts        │  │   Fnd.bot.ts         │
│                        │  │                        │  │                      │
│  • Parse req fields    │  │  • Parse bot message   │  │  • Parse cmd args    │
│  • hasRole() guard     │  │  • No Validator layer  │  │  • No Validator      │
│  • Call Validator      │  │  • Direct svc call     │  │  • Direct svc / DB   │
│  • Call Service        │  │                        │  │                      │
│  • ControllerResponse  │  │                        │  │                      │
└───────────┬────────────┘  └───────────┬────────────┘  └──────────┬───────────┘
            │                           │                           │
            ▼                           │                           │
┌───────────────────────┐               │                           │
│      VALIDATOR         │               │                           │
│   *.validator.ts       │               │                           │
│                        │               │                           │
│  • Field presence      │               │                           │
│  • Type coercion       │               │                           │
│  • Format (regex, len) │               │                           │
│  • Throws              │               │                           │
│    InvalidRequest      │               │                           │
└───────────┬────────────┘               │                           │
            │                            │                           │
            └────────────────────────────┴───────────────────────────┘
                                                    │
                                                    ▼
                         ┌──────────────────────────────────────────────┐
                         │               SERVICE LAYER                   │
                         │             *.service.ts                      │
                         │                                               │
                         │  • Business / domain logic                    │
                         │  • Feature flag gates (internal)              │
                         │  • Calls sibling services where needed        │
                         │  • Calls KnexSqlUtilities for all DB ops      │
                         │  • Calls External APIs directly               │
                         │  • Throws typed domain exceptions             │
                         └────────────────┬──────────────────────────────┘
                                          │
                         ┌────────────────┴──────────────────┐
                         │                                    │
                         ▼                                    ▼
            ┌────────────────────────┐        ┌──────────────────────────┐
            │    KnexSqlUtilities    │        │      External APIs        │
            │  src/utils/Knex...ts   │        │                          │
            │                        │        │  Google Geocoding         │
            │  insert / findOne      │        │  LTA DataMall            │
            │  find / update         │        │  Telegram Bot API        │
            │  delete / upsert       │        │  Douyin webcast          │
            │  raw / count           │        │  Anthropic Claude        │
            │  transaction           │        │  Firebase / Firestore    │
            └───────────┬────────────┘        │  Nodemailer SMTP         │
                        │                     └──────────────────────────┘
                        ▼
                  ┌───────────┐
                  │   MySQL   │
                  │  (wuxi)   │
                  └───────────┘
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
