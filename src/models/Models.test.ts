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
