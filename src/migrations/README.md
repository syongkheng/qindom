## Migrations

Knex migrations (`YYYYMMDDhhmmss_description.ts`), one schema change per file.

- **Never edit an applied migration's logic.** Fix forward with a new file. Formatting-only changes (Prettier) are fine.
- Write `up()` and a matching `down()`. A `down()` that recreates a dropped table restores the schema only, not the data.
- Raw SQL is fine here (`knex.raw`). Name constraints and indexes explicitly.
- Never put a plain `UNIQUE` on a user-chosen value in a soft-deleted table (a `'D'` row would block a new one). Use a VIRTUAL column `IF(record_status='A', col, NULL)` + `UNIQUE`. System ids (uuid, session_id, short_code) can stay plain `UNIQUE`.
- When a table is dropped, delete its `src/models/databases/tb_<table>.ts` row type (`src/models/Models.test.ts` checks this by replaying every migration).

### Running

- `npm run migrate` (and `migrate:status`, `migrate:rollback`, `migrate:make`) uses root `knexfile.ts`, which **deliberately loads `.env` (prod)**. Run it on purpose, never casually.
- `deploy.sh` runs `src/migrate.js` on EC2 after each deploy, so pending migrations reach prod automatically.
- The app itself only migrates on boot when `RUN_MIGRATIONS=true` (see `src/config/db/mysql.ts`).
- See `src/config/README.md` for how the env file is chosen in each case.
