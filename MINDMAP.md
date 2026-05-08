# qindom — Project Mindmap

```
qindom (Express 5 + TypeScript + MySQL)
│
├── INFRASTRUCTURE
│   ├── Runtime: Node 22 / TypeScript 5.9.3
│   ├── Framework: Express 5.1.0
│   ├── Database: MySQL (db: wuxi) via Knex.js
│   ├── Auth: JWT (1-year, Bearer token)
│   ├── Deploy: AWS EC2 ap-southeast-1 — port 3000
│   └── Process manager: PM2 (ecosystem.config.js)
│
├── MIDDLEWARE STACK (global → route-level)
│   ├── CORS (ALLOWED_ORIGINS env var)
│   ├── globalLimiter (100 req/min per IP)
│   ├── express.json (5MB)
│   ├── RestRequestLogger (logs all requests; redacts password/blob/token)
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
│   ├── FEATURE FLAGS  /api/feature
│   │   ├── Get all flags, toggle flag
│   │   └── DB: tb_aa_feature_flag
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
│   ├── SLEEP TRACKER  /api/sleep  [AUTH REQUIRED]
│   │   ├── Sleep log entries (date range queries)
│   │   └── DB: tb_sleep_log
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
│   │       └── Discord user ↔ governor ID via Firestore
│   │
│   ├── DOUYIN  /api/douyin  [AUTH REQUIRED]
│   │   ├── Live stream status check
│   │   ├── Supporter top-up rankings
│   │   ├── Custom SM3 hash + a_bogus token (Evil0ctal port)
│   │   └── Rate limit: 15 req/min
│   │
│   ├── TELEGRAM STORAGE  /api/telegram  [AUTH REQUIRED]
│       ├── Link qindom account to Telegram (ephemeral 10-min token)
│       ├── Upload / list / delete / expire media via bot
│       ├── Stores telegram_file_id only (no binary)
│       ├── Telegram Bot: /start /help /link /get /list /delete /expire
│       └── DB: tb_telegram_link, tb_telegram_media,
│               tb_telegram_link_token
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
├── CODE CONVENTIONS
│   ├── Response interfaces: XyzDto suffix
│   ├── Request bodies: XyzBody suffix
│   ├── URLs: hyphens, not underscores
│   ├── Envelope: { code, status: "Ok"/"Ko", data }
│   ├── Controller factory: createXyzController(db) → Router
│   └── Exceptions: always throw, never return error strings
│
└── ENVIRONMENTS
    ├── Dev: .env.dev, Telegram polling, port 3000
    └── Prod: .env (NODE_ENV=prd), Telegram webhook, AWS EC2
```
