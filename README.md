# qindom

Express 5 + TypeScript REST API backend for the Finderium / Kingdom 236 platform.

- **Runtime:** Node 22
- **Database:** MySQL via Knex.js
- **Auth:** JWT (Bearer tokens)
- **Process manager:** PM2
- **Deployment:** AWS EC2 ap-southeast-1, port 3000

---

## Getting Started

```bash
npm install
npm run dev       # development (uses .env.dev)
npm run build     # compile TypeScript
```

Set `NODE_ENV=prd` to load `.env` (production). Any other value loads `.env.dev`.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `prd` for production, anything else for dev |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | MySQL database name |
| `JWT_SECRET` | Secret used to sign/verify JWT tokens |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

---

## Route Mounts

| Path | Controller | Middlewares |
|------|-----------|-------------|
| `/connectivity` | Connectivity | RestRequestLogger, RequestHeaderFilter |
| `/api/hdb` | HDB | RestRequestLogger, RequestHeaderFilter |
| `/api/lta` | LTA | RestRequestLogger, RequestHeaderFilter |
| `/api/auth` | Auth | RestRequestLogger, RequestHeaderFilter |
| `/api/fnd` | FND | RestRequestLogger |
| `/api/pfp` | Profile | RestRequestLogger, RequestHeaderFilter |
| `/api/analytics` | Heartbeat | RestRequestLogger, RequestHeaderFilter |
| `/api/itinerary` | Itinerary | RestRequestLogger, RequestHeaderFilter |
| `/api/file` | File | RestRequestLogger, RequestHeaderFilter |
| `/api/feature` | Feature | RestRequestLogger, RequestHeaderFilter, featureLimiter |
| `/api/douyin` | Douyin | RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter, douyinLimiter |
| `/api/meal` | Meal | RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter |
| `/api/geocode` | Geocode | RestRequestLogger, RequestHeaderFilter |
| `/api/expense` | Expense | RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter |

---

## Rate Limits

| Limiter | Window | Max Requests | Applied To |
|---------|--------|-------------|------------|
| `globalLimiter` | 1 min | 100 | All routes |
| `loginLimiter` | 15 min | 10 | `POST /api/auth/login` |
| `registerLimiter` | 1 hour | 5 | `POST /api/auth/register` |
| `verifyEmailLimiter` | 15 min | 10 | `POST /api/auth/verify-email` |
| `resendVerifyLimiter` | 15 min | 3 | `POST /api/auth/resend-verify` |
| `identityLimiter` | 15 min | 20 | `POST /api/fnd/identity` |
| `apptLimiter` | 1 hour | 5 | `POST /api/fnd/appt` |
| `douyinLimiter` | 1 min | 15 | `GET /api/douyin/live`, `GET /api/douyin/ranklist` |
| `featureLimiter` | 1 min | 60 | `GET /api/feature`, `POST /api/feature/:key/toggle` |

---

## Middleware

| Middleware | Description |
|-----------|-------------|
| `RestRequestLogger` | Logs all HTTP requests with method, path, and response status. Redacts `password`, `blob`, `blobString`, and `token` fields from log output. |
| `RequestHeaderFilter` | Rejects POST requests without `Content-Type: application/json` with HTTP 415. |
| `MandatoryTokenFilter` | Requires a valid JWT in `Authorization: Bearer <token>`. Returns 401 if missing or expired. Attaches decoded payload to `req.user`. |
| `OptionalTokenFilter` | Attaches `req.user` if a valid JWT is present, but allows requests through without one. |
| `globalLimiter` | Hard cap of 100 requests per IP per minute across all routes. |

---

## Response Envelope

All endpoints return a consistent JSON envelope:

```json
{
    "code": 200,
    "status": "Ok",
    "data": { }
}
```

Error responses use non-200 codes and a descriptive status string or error object in `data`.

---

## Module Documentation

- [Authentication](src/auth/README.md)
- [Connectivity](src/connectivity/README.md)
- [HDB Housing](src/hdb/README.md)
- [LTA Public Transport](src/lta/README.md)
- [Profile](src/profile/README.md)
- [Analytics](src/analytics/README.md)
- [FND / Kingdom](src/fnd/README.md)
- [Itinerary / Travel Planner](src/itinerary/README.md)
- [File Upload](src/file/README.md)
- [Feature Flags](src/feature/README.md)
- [Douyin](src/douyin/README.md)
- [Meal Tracker](src/meal/README.md)
- [Geocode](src/geocode/README.md)
- [Expense Tracker](src/expense/README.md)
