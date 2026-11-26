import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { Router } from "express";
import { ControllerResponse, ResponseStatus } from "./responses/ControllerResponse.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { getUser, requireRole, route } from "../utils/RequestUtilities.js";
import type { IRequestLogContext } from "./IRequestLogContext.js";
import * as publicUuidMigration from "../migrations/20261126000400_make_public_uuids_not_null.js";
import * as dropMcpMigration from "../migrations/20261126000000_drop_mcp_api_key.js";
import * as dropHdbMigration from "../migrations/20261126000100_drop_hdb_pphs_tables.js";
import * as tgImageOwnerMigration from "../migrations/20261126000200_add_created_by_id_to_tg_image.js";
import * as stripPphsMigration from "../migrations/20261126000300_strip_pphs_roles.js";
import * as analyticsReadKeyMigration from "../migrations/20261125000000_add_analytics_read_key.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATABASES_DIR = join(HERE, "databases");
const MIGRATIONS_DIR = join(HERE, "..", "migrations");

// ── Row types (models/databases) ─────────────────────────────────────────────

const rowTypeFiles = readdirSync(DATABASES_DIR).filter((f) => f.endsWith(".ts"));

/** Tables that exist after replaying every migration's `up()` in order (CREATE adds, DROP removes). */
function liveTablesFromMigrations(): Set<string> {
  const live = new Set<string>();
  const statement =
    /CREATE TABLE (?:IF NOT EXISTS )?`?(tb_\w+)`?|DROP TABLE (?:IF EXISTS )?`?(tb_\w+)`?|dropTable(?:IfExists)?\(\s*["'](tb_\w+)["']/g;
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    const source = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const upStart = source.indexOf("export async function up");
    const downStart = source.indexOf("export async function down");
    const up = source.slice(upStart, downStart === -1 ? undefined : downStart);
    for (const match of up.matchAll(statement)) {
      if (match[1]) live.add(match[1]);
      else live.delete(match[2] ?? match[3]);
    }
  }
  return live;
}

describe("models/databases row types", () => {
  test("each file is named after its table and exports exactly one ITB_<TABLE> interface", () => {
    for (const file of rowTypeFiles) {
      const table = file.replace(/\.ts$/, "");
      const source = readFileSync(join(DATABASES_DIR, file), "utf8");
      const exported = [...source.matchAll(/export (?:interface|type) (\w+)/g)].map((m) => m[1]);
      assert.deepEqual(exported, [`I${table.toUpperCase()}`], file);
    }
  });

  test("every row type belongs to a table that still exists after all migrations", () => {
    const live = liveTablesFromMigrations();
    // Sanity: the replay sees creates and drops (mcp key created then dropped; todo created).
    assert.ok(live.has("tb_todo_task"));
    assert.ok(!live.has("tb_mcp_api_key"));
    assert.ok(!live.has("tb_suggestion_activity"));
    assert.ok(!live.has("tb_hdb_pphs"));
    assert.ok(!live.has("tb_hdb_pphs_coordinate"));
    for (const file of rowTypeFiles) {
      const table = file.replace(/\.ts$/, "");
      assert.ok(live.has(table), `${file}: no live ${table} table in src/migrations`);
    }
  });

  test("record_status is typed with RecordStatus, and no row type uses any", () => {
    for (const file of rowTypeFiles) {
      const source = readFileSync(join(DATABASES_DIR, file), "utf8");
      assert.doesNotMatch(source, /:\s*any\b/, file);
      const status = source.match(/record_status\??:\s*([^;]+);/);
      if (status) assert.match(status[1], /^RecordStatus\b/, file);
    }
  });
});

// ── D1 migration: public uuids NOT NULL ──────────────────────────────────────

describe("migration 20261126000400_make_public_uuids_not_null", () => {
  /** Records the SQL a migration step sends, without a database. */
  async function sqlOf(step: (knex: never) => Promise<void>): Promise<string[]> {
    const sent: string[] = [];
    await step({ raw: async (sql: string) => void sent.push(sql) } as never);
    return sent;
  }

  test("up: per table, backfill NULL uuids with UUID() first, then MODIFY to NOT NULL (same VARCHAR(36))", async () => {
    assert.deepEqual(await sqlOf(publicUuidMigration.up), [
      "UPDATE tb_budget_item SET uuid = UUID() WHERE uuid IS NULL",
      "ALTER TABLE tb_budget_item MODIFY COLUMN uuid VARCHAR(36) NOT NULL",
      "UPDATE tb_applepay_transaction SET uuid = UUID() WHERE uuid IS NULL",
      "ALTER TABLE tb_applepay_transaction MODIFY COLUMN uuid VARCHAR(36) NOT NULL",
    ]);
  });

  test("down: relaxes both columns back to NULL and leaves the data alone", async () => {
    assert.deepEqual(await sqlOf(publicUuidMigration.down), [
      "ALTER TABLE tb_budget_item MODIFY COLUMN uuid VARCHAR(36) NULL",
      "ALTER TABLE tb_applepay_transaction MODIFY COLUMN uuid VARCHAR(36) NULL",
    ]);
  });

  test("the type matches the columns' original definition (VARCHAR(36), added NULL with a unique key)", () => {
    for (const [file, key] of [
      ["20260919000000_add_uuid_to_budget_item.ts", "uq_budget_item_uuid"],
      ["20260919000100_add_uuid_category_to_applepay_transaction.ts", "uq_applepay_transaction_uuid"],
    ]) {
      const source = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      assert.match(source, /ADD COLUMN uuid VARCHAR\(36\) NULL AFTER id/, file);
      assert.match(source, new RegExp(`ADD UNIQUE KEY ${key} \\(uuid\\)`), file);
    }
  });
});

// ── Nov 2026 cleanup migrations (SQL recorded against a fake knex, no database) ──

/** A fake knex that records `raw()` SQL + bindings and `schema.dropTableIfExists()` calls. */
function recordingKnex() {
  const raw: { sql: string; bindings?: unknown[] }[] = [];
  const dropped: string[] = [];
  const knex = {
    raw: async (sql: string, bindings?: unknown[]) => void raw.push({ sql, bindings }),
    schema: { dropTableIfExists: async (table: string) => void dropped.push(table) },
  };
  return { knex: knex as never, raw, dropped, sql: () => raw.map((r) => r.sql.replace(/\s+/g, " ").trim()) };
}

describe("migration 20261126000000_drop_mcp_api_key", () => {
  test("up drops tb_mcp_api_key only", async () => {
    const rec = recordingKnex();
    await dropMcpMigration.up(rec.knex);
    assert.deepEqual(rec.dropped, ["tb_mcp_api_key"]);
    assert.equal(rec.raw.length, 0);
  });

  test("down recreates it with the same columns as the original create migration", async () => {
    const rec = recordingKnex();
    await dropMcpMigration.down(rec.knex);
    assert.equal(rec.raw.length, 1);
    const [sql] = rec.sql();
    assert.match(sql, /^CREATE TABLE IF NOT EXISTS tb_mcp_api_key/);
    const original = readFileSync(join(MIGRATIONS_DIR, "20261107000000_create_mcp_api_key.ts"), "utf8");
    for (const column of [
      "user_id",
      "api_key_hash",
      "key_hint",
      "name",
      "record_status",
      "created_dt",
      "created_by_id",
    ]) {
      assert.match(sql, new RegExp(`\\b${column}\\b`), column);
      assert.match(original, new RegExp(`\\b${column}\\b`), column);
    }
  });
});

describe("migration 20261126000100_drop_hdb_pphs_tables", () => {
  test("up drops the coordinate cache first, then tb_hdb_pphs, then clears the 'hdb' log toggles", async () => {
    const rec = recordingKnex();
    await dropHdbMigration.up(rec.knex);
    assert.deepEqual(rec.sql(), [
      "DROP TABLE IF EXISTS tb_hdb_pphs_coordinate",
      "DROP TABLE IF EXISTS tb_hdb_pphs",
      "DELETE FROM tb_telegram_log_subscription WHERE module_key = 'hdb'",
    ]);
  });

  test("down recreates both (empty) tables", async () => {
    const rec = recordingKnex();
    await dropHdbMigration.down(rec.knex);
    const sql = rec.sql();
    assert.equal(sql.length, 2);
    assert.match(sql[0], /^CREATE TABLE IF NOT EXISTS tb_hdb_pphs \(/);
    assert.match(sql[1], /^CREATE TABLE IF NOT EXISTS tb_hdb_pphs_coordinate \(/);
  });
});

describe("migration 20261126000200_add_created_by_id_to_tg_image", () => {
  test("up adds a nullable created_by_id with an index; down removes both", async () => {
    const up = recordingKnex();
    await tgImageOwnerMigration.up(up.knex);
    assert.deepEqual(up.sql(), [
      "ALTER TABLE tb_tg_image ADD COLUMN created_by_id BIGINT NULL AFTER size_in_bytes, ADD KEY idx_tg_image_created_by_id (created_by_id)",
    ]);
    const down = recordingKnex();
    await tgImageOwnerMigration.down(down.knex);
    assert.deepEqual(down.sql(), [
      "ALTER TABLE tb_tg_image DROP KEY idx_tg_image_created_by_id, DROP COLUMN created_by_id",
    ]);
  });
});

describe("migration 20261126000300_strip_pphs_roles up()", () => {
  test("selects candidate rows by LIKE and updates only the rows whose roles actually change", async () => {
    const rows = [
      { id: 1, roles: '["SYSTEM_R5","PPHS_R5"]' },
      { id: 2, roles: '["NOT_PPHS_R5_LOOKALIKE"]' },
      { id: 3, roles: "not json PPHS_R4" },
      { id: 4, roles: '["PPHS_R4","PPHS_R5"]' },
    ];
    const selects: unknown[][] = [];
    const updates: { where: unknown; patch: unknown }[] = [];
    const knex = (table: string) => {
      assert.equal(table, "tb_aa_user");
      return {
        select: (...cols: string[]) => ({
          where: async (...args: unknown[]) => {
            selects.push([cols, ...args]);
            return rows;
          },
        }),
        where: (where: unknown) => ({
          update: async (patch: unknown) => void updates.push({ where, patch }),
        }),
      };
    };
    await stripPphsMigration.up(knex as never);
    assert.deepEqual(selects, [[["id", "roles"], "roles", "like", "%PPHS_R%"]]);
    assert.deepEqual(updates, [
      { where: { id: 1 }, patch: { roles: '["SYSTEM_R5"]' } },
      { where: { id: 4 }, patch: { roles: "[]" } },
    ]);
  });

  test("down is a no-op", async () => {
    await stripPphsMigration.down();
  });
});

describe("migration 20261125000000_add_analytics_read_key", () => {
  type Breakpoint = { key: string; maxWidth: number | null };
  const breakpointsOf = (rec: ReturnType<typeof recordingKnex>) =>
    JSON.parse(String(rec.raw.find((r) => r.sql.includes("breakpoints"))?.bindings?.[0])) as Breakpoint[];

  test("up adds read_key_hash CHAR(64) NULL and sets the dental-directory breakpoints to 460/820/1024", async () => {
    const rec = recordingKnex();
    await analyticsReadKeyMigration.up(rec.knex);
    assert.equal(
      rec.sql()[0],
      "ALTER TABLE tb_analytic_system ADD COLUMN read_key_hash CHAR(64) NULL AFTER allowed_origins",
    );
    assert.match(rec.sql()[1], /WHERE system_key = 'dental-directory'$/);
    assert.deepEqual(
      breakpointsOf(rec).map((b) => [b.key, b.maxWidth]),
      [
        ["sm", 460],
        ["md", 820],
        ["lg", 1024],
        ["xl", null],
      ],
    );
    assert.equal(typeof rec.raw[1].bindings?.[1], "number");
  });

  test("down restores the old breakpoints before dropping the column", async () => {
    const rec = recordingKnex();
    await analyticsReadKeyMigration.down(rec.knex);
    assert.deepEqual(
      breakpointsOf(rec).map((b) => [b.key, b.maxWidth]),
      [
        ["sm", 560],
        ["md", 860],
        ["lg", 1024],
        ["xl", null],
      ],
    );
    assert.equal(rec.sql()[1], "ALTER TABLE tb_analytic_system DROP COLUMN read_key_hash");
  });
});

// ── ControllerResponse + route() over HTTP (in-process, no DB) ───────────────

function logContext(path: string): IRequestLogContext {
  return { requestId: "req_test", startTime: 0, method: "GET", path, ip: "127.0.0.1", events: [] };
}

describe("ControllerResponse via route()", () => {
  let server: Server;
  let baseUrl: string;
  const contexts: IRequestLogContext[] = [];

  before(async () => {
    const router = Router();
    router.get(
      "/ok",
      route("ModelsTest.GET /ok", "fallback", (_req, cr) => cr.ok<{ hello: string }>({ hello: "world" })),
    );
    router.get(
      "/not-found",
      route("ModelsTest.GET /not-found", "fallback", () => {
        throw new Exceptions.NotFound("Nothing here");
      }),
    );
    router.get(
      "/boom",
      route("ModelsTest.GET /boom", "Failed to boom", () => {
        throw new Error("db exploded");
      }),
    );
    router.get(
      "/owner",
      route("ModelsTest.GET /owner", "fallback", (req, cr) => {
        requireRole(req, "SYSTEM_R5");
        return cr.ok<{ id: number }>({ id: getUser(req).id });
      }),
    );
    router.get(
      "/teapot",
      route("ModelsTest.GET /teapot", "fallback", (_req, cr) => cr.result(418, "Teapot", "short")),
    );
    router.get("/api-key", (req, res) => {
      new ControllerResponse(req, res).badAuthorization("Invalid API key");
    });

    const app = express();
    app.use((req, _res, next) => {
      req.logContext = logContext(req.path);
      contexts.push(req.logContext);
      const roles = req.headers["x-test-roles"];
      if (typeof roles === "string") {
        req.user = { id: 7, username: "u", system: "s", roles: roles.split(","), lastLoggedInDt: null };
      }
      next();
    });
    app.use(router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function get(path: string, headers: Record<string, string> = {}) {
    contexts.length = 0;
    const res = await fetch(`${baseUrl}${path}`, { headers });
    return { status: res.status, json: (await res.json()) as { code: number; status: string; data: any } };
  }

  test("ok → 200 envelope { code, status: Ok, data } and the response is recorded", async () => {
    const { status, json } = await get("/ok");
    assert.equal(status, 200);
    assert.deepEqual(json, { code: 200, status: ResponseStatus.OK, data: { hello: "world" } });
    assert.equal(contexts[0].statusCode, 200);
  });

  test("typed exception → its status and the registry body", async () => {
    const { status, json } = await get("/not-found");
    assert.equal(status, 404);
    assert.equal(json.code, 404);
    assert.equal(json.data.code, "entity_not_found");
    assert.equal(json.data.message, "Nothing here");
  });

  test("untyped error → 500 Ko with the fallback (non-prd) and the cause in the request tree", async () => {
    const { status, json } = await get("/boom");
    assert.equal(status, 500);
    assert.deepEqual(json, { code: 500, status: ResponseStatus.KO, data: "Failed to boom" });
    const rendered = JSON.stringify(contexts[0].events);
    assert.match(rendered, /db exploded/);
  });

  test("requireRole on the plain Request: no user / wrong role → 403, right role → 200", async () => {
    assert.equal((await get("/owner")).status, 403);
    assert.equal((await get("/owner", { "x-test-roles": "KS_R3" })).status, 403);
    const { status, json } = await get("/owner", { "x-test-roles": "KS_R3,SYSTEM_R5" });
    assert.equal(status, 200);
    assert.deepEqual(json.data, { id: 7 });
  });

  test("result() answers with any status; badAuthorization() is a plain-string 401", async () => {
    assert.deepEqual((await get("/teapot")).json, { code: 418, status: "Teapot", data: "short" });
    const unauthorized = await get("/api-key");
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.json.data, "Invalid API key");
  });
});
