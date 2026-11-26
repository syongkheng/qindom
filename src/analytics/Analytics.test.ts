import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { RequestHandler } from "express";
import cookieParser from "cookie-parser";
import tokenFilterDb from "../config/db/mysql.js";
import { signToken } from "../token/Token.service.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { BaseException } from "../exceptions/AppExceptions.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import createAnalyticsController from "./Analytics.controller.js";
import { AnalyticsSystemService, toRegisteredSystem } from "./AnalyticsSystem.service.js";
import { AnalyticsReportService, generateReadKey, readKeyMatches } from "./AnalyticsReport.service.js";
import { AnalyticsAccessService } from "./AnalyticsAccess.service.js";
import { AnalyticsDashboardService } from "./AnalyticsDashboard.service.js";
import { parseSummaryHours, validateUserIdParam } from "./Analytics.validator.js";
import { REPORT_BREAKDOWNS, REPORT_CONTRACT, REPORT_METRICS } from "./Analytics.types.js";

// AnalyticsSystem/Report/Access/Dashboard service rules on a fake DB, and every /analytics route
// in-process (real controllers, limiters and MandatoryTokenFilter; fake DB). Nothing leaves the machine.
// Validation parity with the old zod schemas is pinned in Analytics.validator.test.ts.

type Row = Record<string, any>;

const SYSTEM_TABLE = "tb_analytic_system";
const EVENT_TABLE = "tb_analytic_event";
const ACTIVITY_TABLE = "tb_analytic_user_activity";
const USER_TABLE = "tb_aa_user";
const GRANT_TABLE = "tb_aa_resource_access";
const PDCA_ORIGIN = "https://pdcadental.com";
const READ_KEY = "rk_test-viewer-key";

const breakpoints = [
  { key: "sm", label: "Small", maxWidth: 460, size: "small" },
  { key: "xl", label: "X-Large", maxWidth: null, size: "large" },
];

/** KnexSqlUtilities stand-in: equality WHERE, honours `columns`, emulates the few raw queries analytics runs. */
function fakeDb() {
  const tables: Record<string, Row[]> = {
    [SYSTEM_TABLE]: [],
    [EVENT_TABLE]: [],
    [ACTIVITY_TABLE]: [],
    [USER_TABLE]: [],
    [GRANT_TABLE]: [],
  };
  const calls: { op: string; table: string }[] = [];
  let nextId = 1;
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const pick = (row: Row, columns?: readonly string[]) =>
    !columns || columns.includes("*") ? { ...row } : Object.fromEntries(columns.map((c) => [c, row[c]]));
  const db = {
    tables,
    calls,
    async findOne(table: string, where: Row, columns?: readonly string[]) {
      calls.push({ op: "findOne", table });
      const row = tables[table].find((r) => matches(r, where));
      return row ? pick(row, columns) : undefined;
    },
    async find(table: string, where: Row, opts: { orderBy?: string; columns?: readonly string[] } = {}) {
      calls.push({ op: "find", table });
      const rows = tables[table].filter((r) => matches(r, where));
      if (opts.orderBy) rows.sort((a, b) => a[opts.orderBy!] - b[opts.orderBy!]);
      return rows.map((r) => pick(r, opts.columns));
    },
    async insert(table: string, data: Row) {
      calls.push({ op: "insert", table });
      const row = { id: nextId++, ...data };
      tables[table].push(row);
      return { ...row };
    },
    async update(table: string, where: Row, data: Row) {
      calls.push({ op: "update", table });
      const hit = tables[table].filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return hit.map((r) => ({ ...r }));
    },
    async upsert(table: string, data: Row, conflictKey: string, updateData: Row) {
      calls.push({ op: "upsert", table });
      const existing = tables[table].find((r) => r[conflictKey] === data[conflictKey]);
      if (existing) Object.assign(existing, updateData);
      else tables[table].push({ ...data });
    },
    async raw(sql: string, bindings: unknown[]) {
      calls.push({ op: "raw", table: "" });
      if (sql.includes(`FROM ${GRANT_TABLE} ra`)) {
        const [userStatus, type, key, status] = bindings;
        return tables[GRANT_TABLE].flatMap((g) => {
          if (g.resource_type !== type || g.resource_key !== key || g.record_status !== status) return [];
          // INNER JOIN on an active user row: a soft-deleted user's grant drops out.
          const u = tables[USER_TABLE].find((x) => x.id === g.user_id && x.record_status === userStatus);
          return u ? [{ ...g, username: u.username, email: u.email, system: u.system }] : [];
        });
      }
      if (sql.includes("SELECT event, session_id")) {
        const [system, ...rest] = bindings as [string, ...unknown[]];
        const [from, to] = rest.slice(-2) as [number, number];
        return tables[EVENT_TABLE].filter((e) => e.system === system && e.created_at >= from && e.created_at < to);
      }
      return [];
    },
  };
  return db;
}
type FakeDb = ReturnType<typeof fakeDb>;

function seed(db: FakeDb) {
  const now = 1;
  const system = (id: number, key: string, extra: Row = {}) =>
    db.tables[SYSTEM_TABLE].push({
      id,
      system_key: key,
      display_name: key.toUpperCase(),
      breakpoints: JSON.stringify(breakpoints),
      allowed_origins: "[]",
      record_status: RecordStatus.ACTIVE,
      read_key_hash: null,
      created_dt: now,
      updated_dt: now,
      ...extra,
    });
  system(1, "fndom");
  system(2, "dental-directory", {
    allowed_origins: JSON.stringify([PDCA_ORIGIN, "https://www.pdcadental.com"]),
    read_key_hash: sha256Hex(READ_KEY),
  });
  system(3, "retired", { record_status: RecordStatus.DELETED });
}

const asDb = (db: FakeDb) => db as never;
const services = (db: FakeDb) => {
  const systems = new AnalyticsSystemService(asDb(db));
  return {
    systems,
    reports: new AnalyticsReportService(asDb(db), systems, { generateKey: () => "rk_fixed", now: () => 5 }),
    access: new AnalyticsAccessService(asDb(db), systems),
    dashboard: new AnalyticsDashboardService(asDb(db), systems, () => 1_700_000_000_000),
  };
};
const user = (id: number, roles: string[] = []) => ({
  id,
  username: `u${id}`,
  system: "fnd",
  roles,
  lastLoggedInDt: 0,
});

async function rejects(promise: Promise<unknown>, code: string, status: number) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof BaseException);
    assert.equal(err.code, code);
    assert.equal(err.httpStatus, status);
    return true;
  });
}

beforeEach(() => AnalyticsSystemService.invalidate());

// ── Registry + cache ──────────────────────────────────────────────────────────

describe("AnalyticsSystemService", () => {
  test("reads the registry once per minute and only the columns it needs", async () => {
    const db = fakeDb();
    seed(db);
    const { systems } = services(db);
    const ctx = { events: [] } as unknown as IRequestLogContext;
    assert.equal((await systems.getActive("fndom", ctx))?.key, "fndom");
    assert.equal((await systems.getActive("fndom", ctx))?.key, "fndom");
    assert.equal(db.calls.filter((c) => c.op === "find").length, 1);
    assert.deepEqual(
      ctx.events.map((e) => e.detail),
      ["cache miss", "cache hit"],
    );
    // read_key_hash is not selected into the cache
    assert.equal("read_key_hash" in ((await systems.listAdmin())[0] as Row), false);
  });

  test("disabled systems are listed for the owner but never active", async () => {
    const db = fakeDb();
    seed(db);
    const { systems } = services(db);
    assert.equal(await systems.getActive("retired"), undefined);
    assert.equal(await systems.exists("retired"), true);
    assert.deepEqual(
      (await systems.listActive()).map((s) => s.key),
      ["fndom", "dental-directory"],
    );
    assert.deepEqual(await systems.listAdmin().then((l) => l.find((s) => s.key === "retired")), {
      key: "retired",
      displayName: "RETIRED",
      breakpoints,
      allowedOrigins: [],
      active: false,
    });
  });

  test("upsert inserts or updates by key, maps active → record_status and invalidates the cache", async () => {
    const db = fakeDb();
    seed(db);
    const { systems } = services(db);
    await systems.listAdmin();
    await systems.upsert({ key: "fndom", displayName: "Awense", breakpoints, allowedOrigins: [], active: false });
    await systems.upsert({ key: "new-site", displayName: "New", breakpoints, allowedOrigins: [], active: true });
    const rows = db.tables[SYSTEM_TABLE];
    assert.equal(rows.find((r) => r.system_key === "fndom")!.record_status, RecordStatus.DELETED);
    assert.equal(rows.find((r) => r.system_key === "new-site")!.record_status, RecordStatus.ACTIVE);
    assert.equal(rows.find((r) => r.system_key === "new-site")!.breakpoints, JSON.stringify(breakpoints));
    assert.equal(await systems.getActive("fndom"), undefined);
    assert.equal((await systems.getActive("new-site"))?.displayName, "New");
  });

  test("a malformed JSON column reads as an empty list", () => {
    const row = { system_key: "x", display_name: "X", breakpoints: "{", allowed_origins: "[1]", record_status: "A" };
    const system = toRegisteredSystem(row as never);
    assert.deepEqual([system.breakpoints, system.allowedOrigins, system.active], [[], [], true]);
  });
});

// ── Report access (viewer key) ────────────────────────────────────────────────

describe("AnalyticsReportService", () => {
  test("sha256Hex gives the same hash the stored read keys were made with", () => {
    assert.equal(sha256Hex(READ_KEY), crypto.createHash("sha256").update(READ_KEY, "utf8").digest("hex"));
    assert.equal(readKeyMatches(READ_KEY, sha256Hex(READ_KEY)), true);
    assert.equal(readKeyMatches(READ_KEY, "z".repeat(64)), false);
    assert.equal(readKeyMatches(READ_KEY, "abc"), false);
    assert.match(generateReadKey(), /^rk_[A-Za-z0-9_-]{32}$/);
  });

  test("authorise: the same 403 for unknown site, wrong origin, wrong or missing key", async () => {
    const db = fakeDb();
    seed(db);
    const { reports } = services(db);
    await rejects(reports.authorise("example.com", PDCA_ORIGIN, READ_KEY), "forbidden_access", 403);
    await rejects(reports.authorise("pdcadental.com", "https://evil.example", READ_KEY), "forbidden_access", 403);
    await rejects(reports.authorise("pdcadental.com", PDCA_ORIGIN, "rk_wrong"), "forbidden_access", 403);
    await rejects(reports.authorise("pdcadental.com", PDCA_ORIGIN, ""), "forbidden_access", 403);
    assert.equal((await reports.authorise("pdcadental.com", PDCA_ORIGIN, READ_KEY)).key, "dental-directory");
  });

  test("authorise: a request without an Origin header is refused even with the right key (Y1)", async () => {
    const db = fakeDb();
    seed(db);
    await rejects(services(db).reports.authorise("pdcadental.com", undefined, READ_KEY), "forbidden_access", 403);
    await rejects(services(db).reports.authorise("pdcadental.com", "", READ_KEY), "forbidden_access", 403);
  });

  test("authorise: a disabled system or one with no key is refused", async () => {
    const db = fakeDb();
    seed(db);
    db.tables[SYSTEM_TABLE][1].read_key_hash = null;
    await rejects(services(db).reports.authorise("pdcadental.com", PDCA_ORIGIN, READ_KEY), "forbidden_access", 403);
    db.tables[SYSTEM_TABLE][1].read_key_hash = sha256Hex(READ_KEY);
    db.tables[SYSTEM_TABLE][1].record_status = RecordStatus.DELETED;
    AnalyticsSystemService.invalidate();
    await rejects(services(db).reports.authorise("pdcadental.com", PDCA_ORIGIN, READ_KEY), "forbidden_access", 403);
  });

  test("rotateReadKey stores only the hash, returns the key once, and the old key stops working", async () => {
    const db = fakeDb();
    seed(db);
    const { reports } = services(db);
    assert.deepEqual(await reports.rotateReadKey("dental-directory"), { readKey: "rk_fixed" });
    const row = db.tables[SYSTEM_TABLE][1];
    assert.equal(row.read_key_hash, sha256Hex("rk_fixed"));
    assert.equal(row.updated_dt, 5);
    await rejects(reports.authorise("pdcadental.com", PDCA_ORIGIN, READ_KEY), "forbidden_access", 403);
    assert.ok(await reports.authorise("pdcadental.com", PDCA_ORIGIN, "rk_fixed"));
    await rejects(reports.rotateReadKey("nope"), "entity_not_found", 404);
  });
});

// ── Viewer access ─────────────────────────────────────────────────────────────

describe("AnalyticsAccessService", () => {
  function withViewer() {
    const db = fakeDb();
    seed(db);
    db.tables[USER_TABLE].push(
      { id: 7, username: "viewer", email: "v@x", system: "fnd", username_system: "viewer_fnd", record_status: "A" },
      { id: 8, username: "gone", email: null, system: "fnd", username_system: "gone_fnd", record_status: "D" },
    );
    return db;
  }

  test("owner sees every active system; a viewer only granted ones", async () => {
    const db = withViewer();
    const { access } = services(db);
    assert.deepEqual(
      (await access.visibleSystems(user(1, ["SYSTEM_R5"]))).map((s) => s.key),
      ["fndom", "dental-directory"],
    );
    assert.deepEqual(await access.visibleSystems(user(7)), []);
    await access.grant("fndom", "viewer", 1);
    assert.deepEqual(await access.visibleSystems(user(7)), [{ key: "fndom", displayName: "FNDOM", breakpoints }]);
  });

  test("viewableSystem: 403 for not granted, unknown and disabled alike", async () => {
    const db = withViewer();
    const { access } = services(db);
    await rejects(access.viewableSystem(user(7), "fndom"), "forbidden_access", 403);
    await rejects(access.viewableSystem(user(1, ["SYSTEM_R5"]), "nope"), "forbidden_access", 403);
    await rejects(access.viewableSystem(user(1, ["SYSTEM_R5"]), "retired"), "forbidden_access", 403);
    assert.equal((await access.viewableSystem(user(1, ["SYSTEM_R5"]), "fndom")).key, "fndom");
  });

  test("grant: unknown system and unknown/deleted account are 404; revoke removes the grant", async () => {
    const db = withViewer();
    const { access } = services(db);
    await rejects(access.requireSystem("nope"), "entity_not_found", 404);
    await access.requireSystem("retired"); // disabled systems can still be granted
    await rejects(access.grant("fndom", "nobody", 1), "entity_not_found", 404);
    await rejects(access.grant("fndom", "gone", 1), "entity_not_found", 404);
    const grants = await access.grant("fndom", "viewer", 1);
    assert.deepEqual(
      grants.map((g) => [g.userId, g.username, g.accessLevel]),
      [[7, "viewer", "viewer"]],
    );
    assert.deepEqual(await access.revoke("fndom", 7), []);
  });

  test("a grant held by a soft-deleted user isn't listed (soft-deleted = gone)", async () => {
    const db = withViewer();
    const { access } = services(db);
    await access.grant("fndom", "viewer", 1);
    // Granted while active, then the account was soft-deleted.
    db.tables[GRANT_TABLE].push({
      ...db.tables[GRANT_TABLE][0],
      id: 99,
      user_id: 8,
    });
    assert.deepEqual(
      (await access.listGrants("fndom")).map((g) => g.userId),
      [7],
    );
  });
});

// ── Ingest + summary ──────────────────────────────────────────────────────────

describe("AnalyticsDashboardService", () => {
  const body = {
    v: 1 as const,
    system: "fndom",
    event: "page_view",
    sessionId: "s1",
    timestamp: 1_700_000_000_000 - 1000,
    page: "/x",
    referrer: "",
    screen: { width: 390, height: 844, breakpoint: "tablet" },
    properties: { a: 1 },
  };
  const meta = { userId: "", ipAddress: "1.2.3.4", userAgent: "UA" };

  test("collect: unknown or disabled system is 400 invalid_request_system; wrong origin 403", async () => {
    const db = fakeDb();
    seed(db);
    const { dashboard } = services(db);
    await rejects(dashboard.collect({ ...body, system: "nope" }, undefined, meta), "invalid_request_system", 400);
    await rejects(dashboard.collect({ ...body, system: "retired" }, undefined, meta), "invalid_request_system", 400);
    await rejects(
      dashboard.collect({ ...body, system: "dental-directory" }, "https://evil.example", meta),
      "forbidden_access",
      403,
    );
    assert.equal(db.tables[EVENT_TABLE].length, 0);
  });

  test("collect stores the normalised event (unknown breakpoint → 'unknown', visitor → NULL user)", async () => {
    const db = fakeDb();
    seed(db);
    await services(db).dashboard.collect(body, undefined, meta);
    const [row] = db.tables[EVENT_TABLE];
    assert.deepEqual(
      {
        ...row,
        id: undefined,
      },
      {
        id: undefined,
        event: "page_view",
        properties: '{"a":1}',
        page: "/x",
        referrer: "",
        session_id: "s1",
        user_id: undefined,
        ip_address: "1.2.3.4",
        user_agent: "UA",
        screen_width: 390,
        screen_height: 844,
        screen_breakpoint: "unknown",
        screen_size: "unknown",
        system: "fndom",
        created_at: 1_700_000_000_000 - 1000,
      },
    );
  });

  test("summary zero-fills the hourly series and lists every registry bucket", async () => {
    const db = fakeDb();
    seed(db);
    const { systems, dashboard } = services(db);
    const summary = await dashboard.summary((await systems.getActive("fndom"))!, 24);
    assert.equal(summary.views.series.length, 24);
    assert.equal(summary.range.hours, 24);
    assert.equal(summary.range.to, 1_700_000_000_000);
    assert.deepEqual(
      summary.breakpoints.map((b) => b.key),
      ["sm", "xl"],
    );
    assert.deepEqual(
      summary.sizes.map((b) => b.key),
      ["small", "medium", "large"],
    );
    assert.deepEqual(summary.system, { key: "fndom", displayName: "FNDOM", breakpoints });
  });
});

test("summary hours: lenient clamp, never a 400", () => {
  for (const [raw, hours] of [
    [undefined, 24],
    ["", 24],
    ["abc", 24],
    ["0", 24],
    ["-5", 1],
    ["6.9", 6],
    ["168", 168],
    ["1000", 168],
    [["12"], 12],
  ] as [unknown, number][]) {
    assert.equal(parseSummaryHours(raw), hours, String(raw));
  }
});

test("revoke :userId must be a positive whole number", () => {
  assert.equal(validateUserIdParam("7"), 7);
  for (const raw of ["0", "-1", "1.5", "abc", ""]) {
    assert.throws(
      () => validateUserIdParam(raw),
      (err: BaseException) => err.code === "invalid_request_userId",
    );
  }
});

// ── HTTP: every /analytics route in-process ───────────────────────────────────

describe("HTTP /analytics", () => {
  const CSRF = "csrf-test-token";
  const db = fakeDb();
  let server: Server;
  let base: string;
  let ipCounter = 0;
  const previousSecret = process.env.JWT_SECRET;
  let ownerSession = "";
  let viewerSession = "";

  function session(id: number, username: string, roles: string[]): string {
    const token = signToken({ id, username, system: "fnd", roles, lastLoggedInDt: 0 });
    db.tables[USER_TABLE].push({
      id,
      username,
      email: `${username}@x`,
      system: "fnd",
      username_system: `${username}_fnd`,
      roles: JSON.stringify(roles),
      token,
      record_status: RecordStatus.ACTIVE,
    });
    return token;
  }

  async function call(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; session?: string; csrf?: boolean; ip?: string; headers?: Record<string, string> } = {},
  ) {
    const headers: Record<string, string> = { "x-real-ip": opts.ip ?? `10.1.${ipCounter >> 8}.${++ipCounter & 255}` };
    if (method === "POST") headers["Content-Type"] = "application/json";
    const cookies: string[] = [];
    if (opts.session) cookies.push(`jwt_token=${opts.session}`);
    if (opts.session && opts.csrf !== false) {
      cookies.push(`csrf_token=${CSRF}`);
      headers["x-csrf-token"] = CSRF;
    }
    if (cookies.length) headers.cookie = cookies.join("; ");
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...headers, ...opts.headers },
      body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
    });
    return { status: res.status, json: (await res.json()) as any };
  }

  const collectBody = {
    v: 1,
    system: "fndom",
    event: "page_view",
    sessionId: "s1",
    page: "/",
    screen: { width: 390, height: 844, breakpoint: "sm" },
  };
  const reportBody = {
    contract: REPORT_CONTRACT,
    site: "pdcadental.com",
    timezone: "Asia/Singapore",
    period: { start: "2026-10-01", end: "2026-10-31" },
    compare: "previous_month",
    metrics: [...REPORT_METRICS],
    breakdowns: [...REPORT_BREAKDOWNS],
    limit: 8,
  };
  const pdca = { origin: PDCA_ORIGIN, "x-analytics-key": READ_KEY };

  before(async () => {
    process.env.JWT_SECRET = "test-secret";
    seed(db);
    ownerSession = session(100, "owner", ["SYSTEM_R5"]);
    viewerSession = session(101, "viewer", []);
    session(102, "friend", []);
    mock.method(tokenFilterDb, "findOne", (table: string, where: Row, columns?: readonly string[]) =>
      db.findOne(table, where, columns),
    );
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    const fakeLogContext: RequestHandler = (req, _res, next) => {
      req.logContext = { requestId: "test", startTime: 0, method: req.method, path: req.path, ip: "", events: [] };
      next();
    };
    app.use(fakeLogContext);
    app.use("/analytics", createAnalyticsController(asDb(db)));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/analytics`;
  });

  after(async () => {
    mock.restoreAll();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // /collect (public, frozen)

  test("collect: 200 with the frozen acknowledgement; the logged-in username is stored", async () => {
    const anon = await call("POST", "/collect", { body: collectBody, headers: { "user-agent": "UA-1" } });
    assert.equal(anon.status, 200);
    assert.deepEqual(anon.json, { code: 200, status: "Ok", data: { message: "Event recorded successfully." } });
    const stored = db.tables[EVENT_TABLE].at(-1)!;
    assert.equal(stored.user_id, undefined);
    assert.equal(stored.user_agent, "UA-1");
    assert.equal(stored.screen_size, "small"); // derived from the breakpoint
    const authed = await call("POST", "/collect", { body: collectBody, session: viewerSession });
    assert.equal(authed.status, 200);
    assert.equal(db.tables[EVENT_TABLE].at(-1)!.user_id, "viewer");
  });

  test("collect: bad body 400 invalid_request_<field>, unknown system 400, wrong origin 403", async () => {
    const bad = await call("POST", "/collect", { body: { ...collectBody, screen: { width: -1, height: 1 } } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.data.code, "invalid_request_screen.width");
    assert.equal(bad.json.data.typeOfError, "format");
    const unknown = await call("POST", "/collect", { body: { ...collectBody, system: "nope" } });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.json.data.code, "invalid_request_system");
    const origin = await call("POST", "/collect", {
      body: { ...collectBody, system: "dental-directory" },
      headers: { origin: "https://evil.example" },
    });
    assert.equal(origin.status, 403);
    assert.equal(origin.json.data.message, "Origin not allowed for this system");
    const okOrigin = await call("POST", "/collect", {
      body: { ...collectBody, system: "dental-directory" },
      headers: { origin: PDCA_ORIGIN },
    });
    assert.equal(okOrigin.status, 200);
  });

  test("collect: 120 per minute per IP", async () => {
    const ip = "10.200.0.1";
    for (let i = 0; i < 120; i++) assert.equal((await call("POST", "/collect", { body: collectBody, ip })).status, 200);
    assert.equal((await call("POST", "/collect", { body: collectBody, ip })).status, 429);
  });

  // /report (public, viewer key, frozen)

  test("report: 200 with source qindom for the right key and origin", async () => {
    const { status, json } = await call("POST", "/report", { body: reportBody, headers: pdca });
    assert.equal(status, 200);
    assert.equal(json.data.contract, REPORT_CONTRACT);
    assert.equal(json.data.source, "qindom");
    assert.deepEqual(json.data.period, reportBody.period);
    assert.equal(json.data.series.length, 31);
  });

  test("report: a bad request is 400 { message, problems[] } (frozen shape)", async () => {
    const { status, json } = await call("POST", "/report", { body: { ...reportBody, limit: 0 }, headers: pdca });
    assert.equal(status, 400);
    assert.equal(json.status, "Bad Request");
    assert.deepEqual(json.data, {
      message: "Request rejected",
      problems: ["limit must be a whole number from 1 to 20"],
    });
  });

  test("report: the identical 403 for a wrong key, missing key, wrong origin and missing origin", async () => {
    const strip = (j: any) => ({ ...j, data: { ...j.data, timestamp: 0 } });
    const wrongKey = await call("POST", "/report", {
      body: reportBody,
      headers: { ...pdca, "x-analytics-key": "rk_x" },
    });
    const noKey = await call("POST", "/report", { body: reportBody, headers: { origin: PDCA_ORIGIN } });
    const wrongOrigin = await call("POST", "/report", {
      body: reportBody,
      headers: { ...pdca, origin: "https://evil.example" },
    });
    const noOrigin = await call("POST", "/report", { body: reportBody, headers: { "x-analytics-key": READ_KEY } });
    for (const r of [wrongKey, noKey, wrongOrigin, noOrigin]) {
      assert.equal(r.status, 403);
      assert.deepEqual(strip(r.json), strip(wrongKey.json));
    }
    assert.equal(wrongKey.json.data.code, "forbidden_access");
  });

  test("report: 30 per minute per IP", async () => {
    const ip = "10.201.0.1";
    for (let i = 0; i < 30; i++) {
      assert.equal((await call("POST", "/report", { body: reportBody, headers: pdca, ip })).status, 200);
    }
    assert.equal((await call("POST", "/report", { body: reportBody, headers: pdca, ip })).status, 429);
  });

  // JWT reads

  test("systems + summary need a session (401)", async () => {
    assert.equal((await call("GET", "/systems")).status, 401);
    assert.equal((await call("GET", "/systems/fndom/summary")).status, 401);
  });

  test("systems: owner sees every active system, a viewer nothing until granted", async () => {
    const owner = await call("GET", "/systems", { session: ownerSession });
    assert.equal(owner.status, 200);
    assert.deepEqual(
      owner.json.data.map((s: Row) => s.key),
      ["fndom", "dental-directory"],
    );
    assert.deepEqual(Object.keys(owner.json.data[0]).sort(), ["breakpoints", "displayName", "key"]);
    assert.deepEqual((await call("GET", "/systems", { session: viewerSession })).json.data, []);
  });

  test("summary: 403 for a viewer without a grant and for unknown keys; owner gets the dashboard (hours ≤ 168)", async () => {
    assert.equal((await call("GET", "/systems/fndom/summary", { session: viewerSession })).status, 403);
    assert.equal((await call("GET", "/systems/nope/summary", { session: ownerSession })).status, 403);
    const { status, json } = await call("GET", "/systems/fndom/summary?hours=999", { session: ownerSession });
    assert.equal(status, 200);
    assert.equal(json.data.range.hours, 168);
    assert.equal(json.data.views.series.length, 168);
    assert.deepEqual(Object.keys(json.data).sort(), ["breakpoints", "range", "sizes", "system", "topPages", "views"]);
  });

  // OWNER admin

  const ADMIN_ROUTES: ["GET" | "POST", string][] = [
    ["POST", "/admin/systems/fndom/read-key"],
    ["GET", "/admin/systems"],
    ["POST", "/admin/systems"],
    ["GET", "/admin/systems/fndom/access"],
    ["POST", "/admin/systems/fndom/access"],
    ["POST", "/admin/systems/fndom/access/101/revoke"],
  ];

  test("admin: 401 without a session, 403 forbidden_access for non-owners, 403 csrf_invalid without CSRF", async () => {
    for (const [method, path] of ADMIN_ROUTES) {
      assert.equal((await call(method, path)).status, 401, path);
      const viewer = await call(method, path, { session: viewerSession });
      assert.equal(viewer.status, 403, path);
      assert.equal(viewer.json.data.code, "forbidden_access", path);
      assert.equal(viewer.json.data.message, "Insufficient permissions", path);
      if (method === "POST") {
        const noCsrf = await call(method, path, { session: ownerSession, csrf: false });
        assert.equal(noCsrf.json.data, "Invalid or missing CSRF token.", path);
      }
    }
  });

  test("admin systems: list, validate and save (fndom posts the whole row back)", async () => {
    const list = await call("GET", "/admin/systems", { session: ownerSession });
    assert.equal(list.status, 200);
    const fndom = list.json.data.find((s: Row) => s.key === "fndom");
    assert.deepEqual(Object.keys(fndom).sort(), ["active", "allowedOrigins", "breakpoints", "displayName", "key"]);

    const bad = await call("POST", "/admin/systems", { session: ownerSession, body: { ...fndom, breakpoints: [] } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.data.code, "invalid_request_breakpoints");
    const badOrigin = await call("POST", "/admin/systems", {
      session: ownerSession,
      body: { ...fndom, allowedOrigins: ["https://awense.com/"] },
    });
    assert.equal(badOrigin.json.data.code, "invalid_request_allowedOrigins.0");
    const empty = await call("POST", "/admin/systems", { session: ownerSession });
    assert.equal(empty.json.data.code, "invalid_request_key");

    const saved = await call("POST", "/admin/systems", {
      session: ownerSession,
      body: { ...fndom, allowedOrigins: ["https://awense.com"] },
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.json.data.find((s: Row) => s.key === "fndom").allowedOrigins, ["https://awense.com"]);
  });

  test("admin access: grant (404 unknown system, 400 username, 404 no account), list and revoke", async () => {
    const path = "/admin/systems/fndom/access";
    const unknown = await call("POST", "/admin/systems/nope/access", { session: ownerSession, body: {} });
    assert.equal(unknown.status, 404); // the system is checked before the body
    const noName = await call("POST", path, { session: ownerSession, body: { username: " " } });
    assert.equal(noName.status, 400);
    assert.equal(noName.json.data.code, "invalid_request_username");
    const noAccount = await call("POST", path, { session: ownerSession, body: { username: "ghost" } });
    assert.equal(noAccount.status, 404);
    assert.equal(noAccount.json.data.message, "No awense.com account with that username");

    const granted = await call("POST", path, { session: ownerSession, body: { username: " friend " } });
    assert.equal(granted.status, 200);
    assert.deepEqual(
      granted.json.data.map((g: Row) => [g.userId, g.username]),
      [[102, "friend"]],
    );
    assert.deepEqual(Object.keys(granted.json.data[0]).sort(), [
      "accessLevel",
      "email",
      "grantedDt",
      "system",
      "userId",
      "username",
    ]);
    assert.equal((await call("GET", path, { session: ownerSession })).json.data.length, 1);

    const badId = await call("POST", `${path}/abc/revoke`, { session: ownerSession });
    assert.equal(badId.status, 400);
    assert.equal(badId.json.data.code, "invalid_request_userId");
    const revoked = await call("POST", `${path}/102/revoke`, { session: ownerSession });
    assert.equal(revoked.status, 200);
    assert.deepEqual(revoked.json.data, []);
  });

  test("admin read-key: returns the new key once (404 for unknown systems)", async () => {
    const rotated = await call("POST", "/admin/systems/fndom/read-key", { session: ownerSession });
    assert.equal(rotated.status, 200);
    assert.deepEqual(Object.keys(rotated.json.data), ["readKey"]);
    assert.equal(db.tables[SYSTEM_TABLE][0].read_key_hash, sha256Hex(rotated.json.data.readKey));
    assert.equal((await call("POST", "/admin/systems/nope/read-key", { session: ownerSession })).status, 404);
  });

  test("POST /analytics/heartbeat: upserts by session, Anonymous for visitors", async () => {
    assert.equal(
      (await call("POST", "/heartbeat", { body: { system: "fndom" } })).json.data.code,
      "invalid_request_sessionId",
    );
    const ok = await call("POST", "/heartbeat", { body: { sessionId: "hb1", system: "fndom" } });
    assert.deepEqual(ok.json, { code: 200, status: "Ok", data: { message: "Heartbeat recorded successfully." } });
    await call("POST", "/heartbeat", { body: { sessionId: "hb1", system: "fndom" }, session: viewerSession });
    const rows = db.tables[ACTIVITY_TABLE].filter((r) => r.session_id === "hb1");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, "viewer");
  });
});
