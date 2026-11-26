# qindom

Express 5 + TypeScript REST API backend for the Finderium platform.

- **Runtime:** Node 22
- **Database:** MySQL via Knex.js
- **Auth:** JWT in an httpOnly cookie + CSRF header
- **Process manager:** PM2
- **Deployment:** AWS EC2 ap-southeast-1, port 3000

---

## Getting Started

```bash
npm install
npm run dev       # development: NODE_ENV=dev, loads .env.dev
npm test          # node:test suites, no env file loaded, no DB needed
npm run build     # compile TypeScript into dist/
```

PM2 on EC2 runs with `NODE_ENV=prd`, which loads `.env`. **`npm run migrate` always targets `.env` (the prod database)**, on purpose. Details: [src/config/README.md](src/config/README.md).

---

## Environment Variables

| Variable          | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`        | Set by the npm script / PM2: `prd` loads `.env`, anything else `.env.dev` |
| `DB_URL`          | MySQL host (required)                                                     |
| `DB_USER`         | MySQL user                                                                |
| `DB_PW`           | MySQL password                                                            |
| `DB_NAME`         | MySQL database name                                                       |
| `JWT_SECRET`      | Secret used to sign/verify JWT cookies (required; boot fails without it)  |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins                              |
| `PORT`            | Optional, default 3000                                                    |
| `RUN_MIGRATIONS`  | Optional; `true` applies pending migrations at boot                       |

Module-specific keys (SMTP, Telegram, LTA DataMall, wedding URL, PDCA recipient) are documented in each module's README.

---

## Route Mounts, Middleware, Rate Limits

- Route table (`[prefix, preset, router]`): `src/app.ts`, summarised in [MINDMAP.md](MINDMAP.md).
- Middleware presets and rate limiters: [src/middlewares/README.md](src/middlewares/README.md).

---

## Response Envelope

All endpoints return a consistent JSON envelope:

```json
{
  "code": 200,
  "status": "Ok",
  "data": {}
}
```

Error responses use non-200 codes and a descriptive status string or error object in `data`.

---

## Module Documentation

Each module folder under `src/` has a `README.md` (endpoints, auth, request and response shapes); start with [src/config/README.md](src/config/README.md) for env loading.
