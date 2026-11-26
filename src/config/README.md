# config

No routes. Process-wide settings: which env file is loaded, environment flags, the database connection and CORS.

| File               | Role                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadEnv.ts`       | Loads the env file (`.env` when `IS_PRD`, else `.env.dev`) with `override: true`, quietly. Side-effect module: the **first import of `src/index.ts`**, imported nowhere else. Exports `ENV_FILE` for the startup log.      |
| `env.ts`           | `APP_ENV` / `IS_PRD` / `IS_DEV` from `NODE_ENV` (set by the npm script or PM2, never by an env file). Use these instead of comparing `process.env.NODE_ENV`.                                                               |
| `db/connection.ts` | `DB_CLIENT`, `DB_PORT` (3306) and `readDbConnection()`: `DB_URL` / `DB_USER` / `DB_PW` / `DB_NAME`, read on call. Missing `DB_URL` throws (no silent `localhost`). Shared by the app, `migrate.ts` and `knexfile.ts`.      |
| `db/mysql.ts`      | The app's knex instance + default-exported `KnexSqlUtilities` (`import db from "config/db/mysql.js"`), and `initializeDatabase()` (boot: logs host/db/user, `SELECT 1`, optional `RUN_MIGRATIONS=true`, exits on failure). |
| `cors.ts`          | `parseAllowedOrigins(ALLOWED_ORIGINS)` and `createCorsOptions(origins)`: exact-match allow-list, credentials, 204 preflight; requests without `Origin` pass; a foreign origin → `Exceptions.ForbiddenAccess` (403).        |

## Which env file is loaded

| How it runs                                             | `NODE_ENV`                                  | Env file                               | Loaded by                                   |
| ------------------------------------------------------- | ------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| `npm run dev` / `npm run dev:log`                       | `dev` / `dev_log` (npm script)              | `.env.dev`                             | `config/loadEnv.ts` (`override: true`)      |
| PM2 on EC2 (`pm2 start ecosystem.config.cjs --env prd`) | `prd` (`env_prd` in `ecosystem.config.cjs`) | `.env`                                 | `config/loadEnv.ts` (`override: true`)      |
| `npm run migrate` (+ `:rollback`, `:make`, `:status`)   | whatever the shell has                      | **`.env` (prod DB)**                   | root `knexfile.ts`, plain `dotenv.config()` |
| deploy.sh on EC2: `node src/migrate.js`                 | unset                                       | `.env` (the prod one deploy.sh copies) | `src/migrate.ts`, plain `dotenv.config()`   |
| `npm test`                                              | unset                                       | **none**                               | nothing: tests set the variables they need  |

- Paths are relative to the working directory (the project root locally, `/home/ubuntu/qindom` on EC2).
- `override: true` (app only): the env file beats variables already exported in the shell, so a stray prod `DB_URL` in your shell can't leak into dev. The migrate paths use plain `dotenv.config()`, where the shell wins.
- **`npm run migrate` deliberately targets `.env` = the prod database**, not `.env.dev`. That is how migrations are applied today (deploy.sh also runs pending ones on EC2 before restarting PM2). To migrate a different database, export its `DB_*` variables in the shell first (they win over `.env` there).

## Why `loadEnv` must be the first import

ESM evaluates every imported module, in import order, before the importing module's body runs. When `index.ts` called `dotenv.config()` in its body, `config/db/mysql.ts` had already been evaluated, and its own `dotenv.config()` had loaded `.env`: `npm run dev` connected to `.env`'s database while the log printed `.env.dev`'s host. Now `loadEnv.ts` is evaluated first, nothing else loads dotenv (`Config.test.ts` enforces both), and the knex connection settings are read when the first connection opens (`connection: readDbConnection`), so the boot log and the real connection use the same values.

Other modules still read env values lazily inside functions (`getJwtSecret()`, `getTelegramBotToken()`, the mail transporter…): it keeps them independent of import order and lets tests set values per case.

## Startup log

```
init_db   Host: <DB_URL> / Database: <DB_NAME> / User: <DB_USER>    (from readDbConnection(), the values knex uses)
server    Environment: <APP_ENV> (env file: <.env | .env.dev>)
```

## Required variables

`JWT_SECRET` (boot fails without it), `DB_URL` (boot fails without it), `DB_USER`, `DB_PW`, `DB_NAME`, `ALLOWED_ORIGINS` (comma-separated; empty = only Origin-less requests pass CORS). Optional: `PORT` (default 3000), `RUN_MIGRATIONS=true`. Module-specific keys (SMTP, Telegram, LTA, wedding URL) are listed in their module READMEs.
