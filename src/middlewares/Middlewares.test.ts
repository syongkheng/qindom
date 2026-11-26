import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { ErrorRequestHandler, RequestHandler, Router } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mysqlDb from "../config/db/mysql.js";
import { signToken } from "../token/Token.service.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { clientIp, getApiKeyUserId } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { mw } from "./presets.js";
import { RestRequestLogger } from "./RestRequestLogger.js";
import { RequestHeaderFilter } from "./RequestHeaderFilter.js";
import { MandatoryTokenFilter, OptionalTokenFilter, resolveSessionUser } from "./TokenFilter.js";
import { ErrorHandler } from "./ErrorHandler.js";
import * as Limiters from "./RateLimiter.js";

// Pins the request pipeline's behaviour (who gets through, CSRF, limiter windows/limits/keys,
// Telegram alert targets, error shapes). Everything runs in-process: the shared MySQL handle's
// findOne is mocked onto in-memory tables, the request-tree flush is captured instead of written,
// and the Telegram subscription lookups are stubbed. Nothing leaves the machine.

type Row = Record<string, any>;

const USER_TABLE = "tb_aa_user";
const SS_KEY_TABLE = "tb_ss_api_key";
const CSRF = "c".repeat(64);
const SECRET = "middleware-test-secret";

// ── Fake DB (honours columns, equality WHERE) ─────────────────────────────────

const tables: Record<string, Row[]> = { [USER_TABLE]: [], [SS_KEY_TABLE]: [] };
const findOneCalls: { table: string; where: Row; columns: readonly string[] }[] = [];
let failDb = false;

function fakeFindOne(table: string, where: Row = {}, columns: readonly string[] = ["*"]) {
  findOneCalls.push({ table, where, columns });
  if (failDb) return Promise.reject(new Error("db down"));
  const row = (tables[table] ?? []).find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  if (!row) return Promise.resolve(undefined);
  return Promise.resolve(columns.includes("*") ? { ...row } : Object.fromEntries(columns.map((c) => [c, row[c]])));
}

// ── Captured request-tree flushes / Telegram targets ─────────────────────────

interface Flushed {
  context: IRequestLogContext;
  telegramChatIds?: number[];
}
let flushed: Flushed[] = [];
let flushWaiters: (() => void)[] = [];
let failFlush = false;
let subscribedChats: number[] = [];
let failSubscriptions = false;
let disabled = new Set<string>(); // "chatId:moduleKey"

/** Resolves with the next request-tree flush (it runs in `res.on("finish")`, after the response). */
function nextFlush(): Promise<Flushed> {
  return new Promise((resolve) => flushWaiters.push(() => resolve(flushed[flushed.length - 1])));
}

// ── HTTP helper (node:http so headers like User-Agent are fully controlled) ──

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
}

let base = "";

function request(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: string; noUserAgent?: boolean } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "User-Agent": "middleware-test", ...opts.headers };
    if (opts.noUserAgent) delete headers["User-Agent"];
    const req = http.request(`${base}${path}`, { method, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => {
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = text;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, json });
      });
    });
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

let ipCounter = 0;
const freshIp = () => `10.9.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

const postJson = (path: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  request("POST", path, {
    headers: { "Content-Type": "application/json", "X-Real-IP": freshIp(), ...headers },
    body: JSON.stringify(body),
  });

// ── Users / tokens ───────────────────────────────────────────────────────────

function addUser(id: number, username: string, opts: { roles?: string; status?: string } = {}): string {
  const token = signToken({ id: 999, username, system: "fndom", roles: ["JWT_ROLE"], lastLoggedInDt: 1 });
  tables[USER_TABLE].push({
    id,
    username,
    username_system: `${username}_fndom`,
    token,
    roles: opts.roles ?? '["DB_ROLE"]',
    record_status: opts.status ?? "A",
  });
  return token;
}

const authCookie = (token: string, csrf = CSRF) => `jwt_token=${token}; csrf_token=${csrf}`;

function addSsKey(userId: number, rawValue: string, status = "A") {
  tables[SS_KEY_TABLE].push({
    id: tables[SS_KEY_TABLE].length + 1,
    user_id: userId,
    api_key_prefix: "ss",
    api_key_hash: sha256Hex(rawValue),
    record_status: status,
  });
}

// ── App ──────────────────────────────────────────────────────────────────────

const echoUser: RequestHandler = (req, res) => {
  res.status(200).json({ user: req.user ?? null });
};

function buildApp() {
  const app = express();
  app.use(cookieParser());

  // Express apps for the route presets, as index.ts mounts them.
  const json = express.json();
  const echo = Router();
  echo.all("/", echoUser);
  app.use("/std", json, mw.std, echo);
  app.use("/auth", json, mw.auth, echo);
  app.use("/optional", json, RestRequestLogger, OptionalTokenFilter, echo);
  const ssRouter = Router();
  ssRouter.all("/", (req, res) => {
    res.status(200).json({ userId: getApiKeyUserId(req) });
  });
  app.use("/sskey", json, mw.ssKey, ssRouter);
  app.use("/json", json, RestRequestLogger, (req, res) => {
    res.status(200).json({ payload: req.logContext.payload });
  });

  // Everything else: RestRequestLogger alone, no body parser (req.body stays undefined).
  app.all("/{*path}", RestRequestLogger, (req, res) => {
    const status = Number(req.query.status ?? 200);
    res.status(status).json({ ip: req.logContext.ip, payload: req.logContext.payload });
  });

  app.use(ErrorHandler);
  return app;
}

let server: http.Server;
const previousSecret = process.env.JWT_SECRET;
const unhandled: unknown[] = [];
const onUnhandled = (err: unknown) => unhandled.push(err);

before(async () => {
  process.env.JWT_SECRET = SECRET;
  process.on("unhandledRejection", onUnhandled);
  mock.method(mysqlDb, "findOne", fakeFindOne);
  mock.method(
    LoggingUtilities.request,
    "flush",
    (context: IRequestLogContext, options?: { telegramChatIds?: number[] }) => {
      if (failFlush) throw new Error("flush failed");
      flushed.push({ context, telegramChatIds: options?.telegramChatIds });
      flushWaiters.splice(0).forEach((resolve) => resolve());
    },
  );
  mock.method(TelegramLogSubscriptionService.prototype, "listSubscribedChatIdsCached", async () => {
    if (failSubscriptions) throw new Error("whitelist down");
    return subscribedChats;
  });
  mock.method(TelegramLogSubscriptionService.prototype, "isEnabled", async (chatId: number, moduleKey: string) => {
    return !disabled.has(`${chatId}:${moduleKey}`);
  });
  mock.method(LoggingUtilities.service, "warn", () => {});
  mock.method(LoggingUtilities.service, "error", () => {});

  server = buildApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  mock.restoreAll();
  process.off("unhandledRejection", onUnhandled);
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  tables[USER_TABLE] = [];
  tables[SS_KEY_TABLE] = [];
  findOneCalls.length = 0;
  failDb = false;
  failFlush = false;
  failSubscriptions = false;
  subscribedChats = [];
  disabled = new Set();
  flushed = [];
  flushWaiters = [];
});

/** Runs a request and waits for its request-tree flush (fired after the response). */
async function withFlush(run: () => Promise<Res>): Promise<{ res: Res; flush: Flushed }> {
  const flushPromise = nextFlush();
  const res = await run();
  const flush = await flushPromise;
  return { res, flush };
}

// ═════════════════════════════════════════════════════════════════════════════
// MandatoryTokenFilter
// ═════════════════════════════════════════════════════════════════════════════

describe("MandatoryTokenFilter", () => {
  const tokenInvalid = (res: Res, message: string) => {
    assert.equal(res.status, 401);
    assert.deepEqual(res.json, { code: 401, status: "token_invalid", data: message });
  };

  test("no jwt cookie → 401 token_invalid 'Authentication required.'", async () => {
    tokenInvalid(await request("GET", "/auth"), "Authentication required.");
  });

  test("garbage token → 401 'Invalid authentication'", async () => {
    tokenInvalid(
      await request("GET", "/auth", { headers: { Cookie: authCookie("not-a-jwt") } }),
      "Invalid authentication. Please log in again.",
    );
  });

  test("token signed with another secret → 401 'Invalid authentication'", async () => {
    const forged = jwt.sign({ username: "amy", system: "fndom" }, "other-secret", { algorithm: "HS256" });
    tokenInvalid(
      await request("GET", "/auth", { headers: { Cookie: authCookie(forged) } }),
      "Invalid authentication. Please log in again.",
    );
  });

  test("alg none token → 401 'Invalid authentication'", async () => {
    const none = jwt.sign({ username: "amy", system: "fndom" }, "", { algorithm: "none" });
    tokenInvalid(
      await request("GET", "/auth", { headers: { Cookie: authCookie(none) } }),
      "Invalid authentication. Please log in again.",
    );
  });

  test("expired token → 401 'session has expired'", async () => {
    addUser(1, "amy");
    const expired = jwt.sign({ username: "amy", system: "fndom", exp: Math.floor(Date.now() / 1000) - 60 }, SECRET, {
      algorithm: "HS256",
    });
    tables[USER_TABLE][0].token = expired;
    tokenInvalid(
      await request("GET", "/auth", { headers: { Cookie: authCookie(expired) } }),
      "Your session has expired. Please log in again.",
    );
  });

  test("valid JWT that is no longer the stored token (revoked/rotated) → 401 'no longer valid'", async () => {
    const token = addUser(1, "amy");
    tables[USER_TABLE][0].token = "something-else";
    tokenInvalid(
      await request("GET", "/auth", { headers: { Cookie: authCookie(token) } }),
      "Your session is no longer valid. Please log in again.",
    );
  });

  test("soft-deleted user → 401 'no longer valid'", async () => {
    const token = addUser(1, "amy", { status: "D" });
    tokenInvalid(
      await request("GET", "/auth", { headers: { Cookie: authCookie(token) } }),
      "Your session is no longer valid. Please log in again.",
    );
  });

  test("DB failure during the revocation lookup → 401 'Invalid authentication'", async () => {
    const token = addUser(1, "amy");
    failDb = true;
    tokenInvalid(
      await request("GET", "/auth", { headers: { Cookie: authCookie(token) } }),
      "Invalid authentication. Please log in again.",
    );
  });

  test("GET with a valid session needs no CSRF header; id and roles come from the DB row, not the JWT", async () => {
    const token = addUser(7, "amy", { roles: '["SYSTEM_R5"]' });
    const res = await request("GET", "/auth", { headers: { Cookie: authCookie(token) } });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.id, 7);
    assert.deepEqual(res.json.user.roles, ["SYSTEM_R5"]);
    assert.equal(res.json.user.username, "amy");
    assert.equal(res.json.user.system, "fndom");
    const lookup = findOneCalls.find((c) => c.table === USER_TABLE)!;
    assert.deepEqual(lookup.where, { username_system: "amy_fndom", record_status: "A" });
    assert.deepEqual([...lookup.columns].sort(), ["id", "roles", "token"]);
  });

  test("unparseable roles column → empty roles", async () => {
    const token = addUser(7, "amy", { roles: "not json" });
    const res = await request("GET", "/auth", { headers: { Cookie: authCookie(token) } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.user.roles, []);
  });

  test("POST without X-CSRF-Token → 403 csrf_invalid", async () => {
    const token = addUser(1, "amy");
    const res = await postJson("/auth", {}, { Cookie: authCookie(token) });
    assert.equal(res.status, 403);
    assert.deepEqual(res.json, { code: 403, status: "csrf_invalid", data: "Invalid or missing CSRF token." });
  });

  test("POST with a mismatched CSRF header (same length / other length) → 403", async () => {
    const token = addUser(1, "amy");
    for (const header of ["d".repeat(64), "short"]) {
      const res = await postJson("/auth", {}, { Cookie: authCookie(token), "X-CSRF-Token": header });
      assert.equal(res.status, 403, header);
      assert.equal(res.json.status, "csrf_invalid");
    }
  });

  test("POST with header but no csrf cookie → 403", async () => {
    const token = addUser(1, "amy");
    const res = await postJson("/auth", {}, { Cookie: `jwt_token=${token}`, "X-CSRF-Token": CSRF });
    assert.equal(res.status, 403);
  });

  test("POST with matching CSRF cookie + header → passes", async () => {
    const token = addUser(1, "amy");
    const res = await postJson("/auth", {}, { Cookie: authCookie(token), "X-CSRF-Token": CSRF });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.id, 1);
  });

  test("pinned: CSRF header with the cookie's length but more bytes (latin-1 'é' vs 'e') → 401 'Invalid authentication'", async () => {
    const token = addUser(1, "amy");
    const res = await postJson("/auth", {}, { Cookie: authCookie(token, "e"), "X-CSRF-Token": "\u00e9" });
    assert.equal(res.status, 401);
    assert.equal(res.json.data, "Invalid authentication. Please log in again.");
  });

  test("failures are recorded on the request tree's JWT event", async () => {
    const { flush } = await withFlush(() => request("GET", "/auth"));
    const jwtEvent = flush.context.events.find((e) => e.message === "JWT");
    assert.equal(jwtEvent?.stage, "middleware");
    assert.deepEqual(jwtEvent?.children, ["missing jwt cookie"]);
  });

  test("token is checked before CSRF: revoked token without CSRF → 401, not 403", async () => {
    const token = addUser(1, "amy");
    tables[USER_TABLE][0].token = "rotated";
    const res = await postJson("/auth", {}, { Cookie: authCookie(token) });
    assert.equal(res.status, 401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// OptionalTokenFilter
// ═════════════════════════════════════════════════════════════════════════════

describe("OptionalTokenFilter", () => {
  test("no cookie → visitor, POST without CSRF allowed", async () => {
    const get = await request("GET", "/optional");
    assert.equal(get.status, 200);
    assert.equal(get.json.user, null);
    const post = await postJson("/optional");
    assert.equal(post.status, 200);
    assert.equal(post.json.user, null);
  });

  test("invalid / expired token → visitor", async () => {
    const res = await postJson("/optional", {}, { Cookie: authCookie("garbage") });
    assert.equal(res.status, 200);
    assert.equal(res.json.user, null);
  });

  test("revoked token → visitor (no CSRF demanded)", async () => {
    const token = addUser(1, "amy");
    tables[USER_TABLE][0].token = "rotated";
    const res = await postJson("/optional", {}, { Cookie: authCookie(token) });
    assert.equal(res.status, 200);
    assert.equal(res.json.user, null);
  });

  test("valid session + POST without CSRF → 403 csrf_invalid", async () => {
    const token = addUser(1, "amy");
    const res = await postJson("/optional", {}, { Cookie: authCookie(token) });
    assert.equal(res.status, 403);
    assert.deepEqual(res.json, { code: 403, status: "csrf_invalid", data: "Invalid or missing CSRF token." });
  });

  test("valid session + GET → user attached from the DB row", async () => {
    const token = addUser(3, "amy", { roles: '["OWNER"]' });
    const res = await request("GET", "/optional", { headers: { Cookie: authCookie(token) } });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.id, 3);
    assert.deepEqual(res.json.user.roles, ["OWNER"]);
  });

  test("valid session + POST with CSRF → user attached", async () => {
    const token = addUser(3, "amy");
    const res = await postJson("/optional", {}, { Cookie: authCookie(token), "X-CSRF-Token": CSRF });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.id, 3);
  });

  test("pinned: CSRF header with the cookie's length but more bytes → visitor (not 403)", async () => {
    const token = addUser(3, "amy");
    const res = await postJson("/optional", {}, { Cookie: authCookie(token, "e"), "X-CSRF-Token": "\u00e9" });
    assert.equal(res.status, 200);
    assert.equal(res.json.user, null);
  });

  test("DB failure → visitor", async () => {
    const token = addUser(3, "amy");
    failDb = true;
    const res = await postJson("/optional", {}, { Cookie: authCookie(token) });
    assert.equal(res.status, 200);
    assert.equal(res.json.user, null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// resolveSessionUser (camera dashboard WebSocket)
// ═════════════════════════════════════════════════════════════════════════════

describe("resolveSessionUser", () => {
  test("missing / garbage / revoked / DB failure → null; valid → user from the DB row", async () => {
    assert.equal(await resolveSessionUser(undefined), null);
    assert.equal(await resolveSessionUser(""), null);
    assert.equal(await resolveSessionUser("garbage"), null);

    const token = addUser(5, "amy", { roles: '["OWNER"]' });
    const user = await resolveSessionUser(token);
    assert.equal(user?.id, 5);
    assert.deepEqual(user?.roles, ["OWNER"]);
    assert.equal(user?.username, "amy");

    failDb = true;
    assert.equal(await resolveSessionUser(token), null);
    failDb = false;

    tables[USER_TABLE][0].token = "rotated";
    assert.equal(await resolveSessionUser(token), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RequestApiKeyFilter("ss") via mw.ssKey
// ═════════════════════════════════════════════════════════════════════════════

describe("RequestApiKeyFilter", () => {
  const RAW = "a".repeat(64);
  const unauthorized = (res: Res) => {
    assert.equal(res.status, 401);
    // Shortcuts/Scriptable contract: a plain-string 401, not the registry error shape.
    assert.deepEqual(res.json, { code: 401, status: "Ko", data: "Unauthorized. Missing or invalid API key." });
  };
  const withKey = (key?: string) =>
    request("GET", "/sskey", { headers: key === undefined ? {} : { "x-api-key": key } });

  test("missing / empty header → 401", async () => {
    unauthorized(await withKey());
    unauthorized(await withKey(""));
  });

  test("wrong prefix → 401 without a DB lookup", async () => {
    addSsKey(1, RAW);
    unauthorized(await withKey(`mcp_${RAW}`));
    unauthorized(await withKey(`SS_${RAW}`));
    assert.equal(findOneCalls.length, 0);
  });

  test("no separator / unknown key / revoked key → 401", async () => {
    tables[USER_TABLE].push({ id: 1, username: "amy", record_status: "A" });
    addSsKey(1, RAW, "D");
    unauthorized(await withKey("ss"));
    unauthorized(await withKey("ss_"));
    unauthorized(await withKey(`ss_${"b".repeat(64)}`));
    unauthorized(await withKey(`ss_${RAW}`));
  });

  test("key whose owner row is gone → 401", async () => {
    addSsKey(42, RAW);
    unauthorized(await withKey(`ss_${RAW}`));
  });

  test("DB failure → 401 (not 500)", async () => {
    addSsKey(1, RAW);
    failDb = true;
    unauthorized(await withKey(`ss_${RAW}`));
  });

  test("valid key → passes and exposes the owner's id to getApiKeyUserId", async () => {
    tables[USER_TABLE].push({ id: 9, username: "amy", record_status: "A" });
    addSsKey(9, RAW);
    const res = await withKey(`ss_${RAW}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { userId: 9 });
    const keyLookup = findOneCalls.find((c) => c.table === SS_KEY_TABLE)!;
    assert.deepEqual(keyLookup.where, { api_key_prefix: "ss", api_key_hash: sha256Hex(RAW), record_status: "A" });
    const userLookup = findOneCalls.find((c) => c.table === USER_TABLE)!;
    // Pinned (QUESTION): the owner's record_status is not checked.
    assert.deepEqual(userLookup.where, { id: 9 });
  });

  test("pinned: a soft-deleted owner's key still works (owner record_status not checked)", async () => {
    tables[USER_TABLE].push({ id: 9, username: "amy", record_status: "D" });
    addSsKey(9, RAW);
    assert.equal((await withKey(`ss_${RAW}`)).status, 200);
  });

  test("pinned: only the segment after the first '_' is hashed (trailing '_…' ignored)", async () => {
    tables[USER_TABLE].push({ id: 9, username: "amy", record_status: "A" });
    addSsKey(9, RAW);
    assert.equal((await withKey(`ss_${RAW}_anything`)).status, 200);
  });

  test("the raw key never reaches the request tree", async () => {
    tables[USER_TABLE].push({ id: 9, username: "amy", record_status: "A" });
    addSsKey(9, RAW);
    const { res, flush } = await withFlush(() => withKey(`ss_${RAW}`));
    assert.equal(res.status, 200);
    assert.ok(!JSON.stringify(flush.context).includes(RAW));
  });

  test("a failed lookup is answered 401 but recorded as an exception in the request tree", async () => {
    addSsKey(1, RAW);
    failDb = true;
    const { res, flush } = await withFlush(() => withKey(`ss_${RAW}`));
    unauthorized(res);
    assert.ok(flush.context.events.some((e) => e.type === "ERROR" && e.detail === "Error: db down"));
  });

  test("selects only the columns it needs", async () => {
    tables[USER_TABLE].push({ id: 9, username: "amy", record_status: "A" });
    addSsKey(9, RAW);
    await withKey(`ss_${RAW}`);
    assert.deepEqual(
      findOneCalls.map((c) => [c.table, [...c.columns]]),
      [
        [SS_KEY_TABLE, ["user_id"]],
        [USER_TABLE, ["id"]],
      ],
    );
  });

  test("RequestHeaderFilter runs first: POST without JSON content type → 415 before the key check", async () => {
    const res = await request("POST", "/sskey", { headers: { "Content-Type": "text/plain" }, body: "x" });
    assert.equal(res.status, 415);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RequestHeaderFilter via mw.std
// ═════════════════════════════════════════════════════════════════════════════

describe("RequestHeaderFilter", () => {
  test("GET needs no content type", async () => {
    assert.equal((await request("GET", "/std")).status, 200);
  });

  test("POST application/json (with charset) passes", async () => {
    const res = await request("POST", "/std", {
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: "{}",
    });
    assert.equal(res.status, 200);
  });

  test("POST without content type / with text/plain → 415", async () => {
    for (const headers of [{}, { "Content-Type": "text/plain" }] as Record<string, string>[]) {
      const res = await request("POST", "/std", { headers, body: "x" });
      assert.equal(res.status, 415);
      assert.equal(res.json.code, 415);
      assert.equal(res.json.status, "Unsupported Media Type");
      assert.equal(res.json.data.code, "unsupported_media_type");
      assert.equal(res.json.data.message, "Content-Type must be application/json");
    }
  });

  test("missing User-Agent → 400 invalid_request_user-agent", async () => {
    const res = await request("GET", "/std", { noUserAgent: true });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 400);
    assert.equal(res.json.data.code, "invalid_request_user-agent");
    assert.equal(res.json.data.fieldName, "user-agent");
    assert.equal(res.json.data.typeOfError, "mandatory");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RestRequestLogger
// ═════════════════════════════════════════════════════════════════════════════

describe("RestRequestLogger", () => {
  test("POST with no body and no body parser does not crash (payload {})", async () => {
    const { res, flush } = await withFlush(() => request("POST", "/raw/anything"));
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.payload, {});
    assert.deepEqual(flush.context.payload, {});
  });

  test("GET logs the redacted query; POST the redacted body", async () => {
    const get = await withFlush(() => request("GET", "/raw/x?password=hunter2&page=2"));
    assert.deepEqual(get.res.json.payload, { password: "[REDACTED]", page: "2" });
    assert.equal(get.flush.context.path, "/raw/x?password=%5BREDACTED%5D&page=2");

    const post = await withFlush(() => postJson("/json", { apiKey: "ss_secret", name: "x" }));
    assert.deepEqual(post.res.json.payload, { apiKey: "[REDACTED]", name: "x" });
  });

  test("request id, method, status and IP (X-Real-IP, else socket address)", async () => {
    const { res, flush } = await withFlush(() =>
      request("GET", "/raw/x?status=418", { headers: { "X-Real-IP": "203.0.113.9" } }),
    );
    assert.equal(res.status, 418);
    assert.equal(res.json.ip, "203.0.113.9");
    assert.match(flush.context.requestId, /^req_[0-9a-f]{12}$/);
    assert.equal(flush.context.method, "GET");
    assert.equal(flush.context.statusCode, 418);
    assert.equal(flush.context.currentStage, "middleware");

    const noHeader = await request("GET", "/raw/x");
    assert.equal(typeof noHeader.json.ip, "string");
    assert.match(noHeader.json.ip, /127\.0\.0\.1$/);
  });

  describe("Telegram targets", () => {
    test("no subscribed chats → none", async () => {
      const { flush } = await withFlush(() => request("GET", "/raw/x"));
      assert.deepEqual(flush.telegramChatIds, []);
    });

    test("unmapped route → every subscribed chat", async () => {
      subscribedChats = [1, 2];
      const { flush } = await withFlush(() => request("GET", "/raw/x"));
      assert.deepEqual(flush.telegramChatIds, [1, 2]);
    });

    test("silent routes: successes go nowhere, errors still alert everyone; query string ignored", async () => {
      subscribedChats = [1, 2];
      for (const path of ["/analytics/heartbeat", "/analytics/collect?x=1", "/camera/device/register"]) {
        const ok = await withFlush(() => request("POST", path));
        assert.deepEqual(ok.flush.telegramChatIds, [], path);
        const failed = await withFlush(() => request("POST", `${path}${path.includes("?") ? "&" : "?"}status=400`));
        assert.deepEqual(failed.flush.telegramChatIds, [1, 2], path);
      }
    });

    test("silent routes are per method: GET /analytics/collect is not silenced", async () => {
      subscribedChats = [1, 2];
      const { flush } = await withFlush(() => request("GET", "/analytics/collect"));
      assert.deepEqual(flush.telegramChatIds, [1, 2]);
    });

    test("mapped module: successes go to chats that haven't muted it; errors (4xx/5xx) to every chat", async () => {
      subscribedChats = [1, 2, 3];
      disabled = new Set(["2:budget", "3:analytics"]);
      const ok = await withFlush(() => request("GET", "/budget/list"));
      assert.deepEqual(ok.flush.telegramChatIds, [1, 3]);
      const exact = await withFlush(() => request("GET", "/budget"));
      assert.deepEqual(exact.flush.telegramChatIds, [1, 3]);
      const notFound = await withFlush(() => request("GET", "/budget/list?status=404"));
      assert.deepEqual(notFound.flush.telegramChatIds, [1, 2, 3]);
      const crashed = await withFlush(() => request("GET", "/budget/list?status=500"));
      assert.deepEqual(crashed.flush.telegramChatIds, [1, 2, 3]);
      // a prefix match needs a "/" boundary: /budgets is not the budget module
      const other = await withFlush(() => request("GET", "/budgets"));
      assert.deepEqual(other.flush.telegramChatIds, [1, 2, 3]);
    });

    test("subscription lookup failure → no Telegram targets, but the tree is still flushed", async () => {
      subscribedChats = [1];
      failSubscriptions = true;
      const { res, flush } = await withFlush(() => request("GET", "/raw/x?status=500"));
      assert.equal(res.status, 500);
      assert.deepEqual(flush.telegramChatIds, []);
    });

    test("a throwing flush is caught: no unhandled rejection, the server keeps answering", async () => {
      failFlush = true;
      const before = unhandled.length;
      const res = await request("GET", "/raw/x");
      assert.equal(res.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(unhandled.length, before);
      failFlush = false;
      assert.equal((await request("GET", "/raw/x")).status, 200);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ErrorHandler
// ═════════════════════════════════════════════════════════════════════════════

describe("ErrorHandler", () => {
  let errServer: http.Server;
  let errBase = "";
  const GENERIC_500 = "An internal error occurred. Please try again later.";

  const fakeLogContext: RequestHandler = (req, _res, next) => {
    req.logContext = { requestId: "test", startTime: 0, method: req.method, path: req.path, ip: "", events: [] };
    next();
  };
  const throwing =
    (err: unknown): RequestHandler =>
    () => {
      throw err;
    };

  before(async () => {
    const app = express();
    const cases: Record<string, unknown> = {
      typed: new Exceptions.NotFound("Nope"),
      multerSize: Object.assign(new Error("File too large"), { name: "MulterError", code: "LIMIT_FILE_SIZE" }),
      multerOther: Object.assign(new Error("Unexpected field"), { name: "MulterError", code: "LIMIT_UNEXPECTED_FILE" }),
      exposed: Object.assign(new Error("CORS: origin 'https://evil.example' not allowed"), {
        status: 403,
        expose: true,
      }),
      hidden: Object.assign(new Error("secret detail"), { status: 413, expose: false }),
      serverHttpError: Object.assign(new Error("upstream"), { status: 503, expose: true }),
      plain: new Error("boom at /home/ubuntu/qindom/src/x.ts"),
    };
    for (const [name, err] of Object.entries(cases)) {
      app.get(`/ctx/${name}`, fakeLogContext, throwing(err));
      app.get(`/bare/${name}`, throwing(err));
    }
    app.post("/ctx/json", fakeLogContext, express.json(), (_req, res) => {
      res.json({});
    });
    app.post("/bare/json", express.json(), (_req, res) => {
      res.json({});
    });
    app.get("/ctx/after-headers", fakeLogContext, (_req, res, next) => {
      res.status(200).write("partial");
      next(new Error("mid-stream"));
    });
    app.use(ErrorHandler);
    // Express's own handler after ours: only reached for the headers-sent case.
    const fallback: ErrorRequestHandler = (_err, _req, res, _next) => {
      res.end();
    };
    app.use(fallback);
    errServer = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => errServer.once("listening", resolve));
    errBase = `http://127.0.0.1:${(errServer.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => errServer.close(() => resolve()));
  });

  const get = (path: string) =>
    fetch(`${errBase}${path}`).then(async (r) => ({
      status: r.status,
      json: (await r.json().catch(() => null)) as any,
    }));

  for (const prefix of ["ctx", "bare"]) {
    test(`${prefix}: typed exception → its status + registry body`, async () => {
      const res = await get(`/${prefix}/typed`);
      assert.equal(res.status, 404);
      assert.equal(res.json.status, "Not Found");
      assert.equal(res.json.data.code, "entity_not_found");
      assert.equal(res.json.data.message, "Nope");
    });

    test(`${prefix}: Multer errors → 413 (file size) / 400`, async () => {
      const size = await get(`/${prefix}/multerSize`);
      assert.deepEqual([size.status, size.json.data], [413, "File too large"]);
      const other = await get(`/${prefix}/multerOther`);
      assert.deepEqual([other.status, other.json.data], [400, "Unexpected field"]);
    });

    test(`${prefix}: http-errors 4xx → message only when exposed`, async () => {
      const exposed = await get(`/${prefix}/exposed`);
      assert.deepEqual(exposed.json, {
        code: 403,
        status: "Forbidden",
        data: "CORS: origin 'https://evil.example' not allowed",
      });
      const hidden = await get(`/${prefix}/hidden`);
      assert.deepEqual(hidden.json, { code: 413, status: "Payload Too Large", data: "Payload Too Large" });
    });

    test(`${prefix}: anything else (incl. 5xx http-errors) → generic 500, no internals`, async () => {
      for (const name of ["plain", "serverHttpError"]) {
        const res = await get(`/${prefix}/${name}`);
        assert.equal(res.status, 500);
        assert.equal(res.json.code, 500);
        assert.equal(res.json.status, "Ko");
        assert.equal(res.json.data, GENERIC_500);
      }
    });

    test(`${prefix}: malformed JSON → 400 'Malformed JSON body'`, async () => {
      const r = await fetch(`${errBase}/${prefix}/json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad",
      });
      assert.equal(r.status, 400);
      assert.deepEqual(await r.json(), { code: 400, status: "Bad Request", data: "Malformed JSON body" });
    });
  }

  test("headers already sent → delegated to the next handler (connection closed, no JSON)", async () => {
    const r = await fetch(`${errBase}/ctx/after-headers`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "partial");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Rate limiters: window, limit, message, keying (pinned)
// ═════════════════════════════════════════════════════════════════════════════

describe("Rate limiters", () => {
  let rlServer: http.Server;
  let rlBase = "";

  const MIN = 60;
  const EXPECTED: {
    name: keyof typeof Limiters;
    limit: number;
    windowSec: number;
    message: string;
    skipSuccessful?: boolean;
  }[] = [
    { name: "globalLimiter", limit: 100, windowSec: MIN, message: "Too many requests. Please slow down." },
    {
      name: "loginLimiter",
      limit: 10,
      windowSec: 15 * MIN,
      message: "Too many login attempts. Please try again in 15 minutes.",
    },
    {
      name: "registerLimiter",
      limit: 5,
      windowSec: 60 * MIN,
      message: "Too many registration attempts. Please try again in an hour.",
    },
    {
      name: "verifyEmailLimiter",
      limit: 10,
      windowSec: 15 * MIN,
      message: "Too many verification attempts. Please try again in 15 minutes.",
    },
    {
      name: "resendVerifyLimiter",
      limit: 3,
      windowSec: 15 * MIN,
      message: "Too many resend requests. Please try again in 15 minutes.",
    },
    { name: "adminLimiter", limit: 60, windowSec: 15 * MIN, message: "Too many admin requests. Please slow down." },
    {
      name: "itineraryChallengeLimiter",
      limit: 10,
      windowSec: 15 * MIN,
      message: "Too many access code attempts. Please try again in 15 minutes.",
      skipSuccessful: true,
    },
    {
      name: "weddingRsvpLimiter",
      limit: 10,
      windowSec: 15 * MIN,
      message: "Too many RSVP submissions. Please try again in 15 minutes.",
    },
    { name: "houseViewLimiter", limit: 60, windowSec: MIN, message: "Too many requests. Please slow down." },
    { name: "analyticsLimiter", limit: 120, windowSec: MIN, message: "Too many analytics events. Please slow down." },
    {
      name: "cameraRegisterLimiter",
      limit: 30,
      windowSec: 60 * MIN,
      message: "Too many device registrations. Please try again later.",
    },
    {
      name: "cameraClaimIpLimiter",
      limit: 10,
      windowSec: 15 * MIN,
      message: "Too many pairing attempts. Please try again in 15 minutes.",
      skipSuccessful: true,
    },
    {
      name: "cameraClaimUserLimiter",
      limit: 5,
      windowSec: 15 * MIN,
      message: "Too many pairing attempts. Please try again in 15 minutes.",
      skipSuccessful: true,
    },
    {
      name: "analyticsReportLimiter",
      limit: 30,
      windowSec: MIN,
      message: "Too many report requests. Please slow down.",
    },
    {
      name: "pdcaEnquiryLimiter",
      limit: 5,
      windowSec: 10 * MIN,
      message: "Too many messages. Please try again in 10 minutes, or WhatsApp us.",
    },
  ];

  before(async () => {
    const app = express();
    // Stands in for MandatoryTokenFilter ahead of cameraClaimUserLimiter.
    app.use((req, _res, next) => {
      const id = req.headers["x-test-user"];
      if (id)
        req.user = {
          id: Number(id),
          username: "u",
          system: "s",
          roles: [],
          lastLoggedInDt: 0,
        };
      next();
    });
    for (const { name } of EXPECTED) {
      app.get(`/${name}`, Limiters[name] as RequestHandler, (req, res) => {
        res.status(Number(req.query.status ?? 200)).json({ ok: true });
      });
    }
    rlServer = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => rlServer.once("listening", resolve));
    rlBase = `http://127.0.0.1:${(rlServer.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => rlServer.close(() => resolve()));
  });

  const hit = async (name: string, headers: Record<string, string> = {}, status = 200) => {
    const r = await fetch(`${rlBase}/${name}?status=${status}`, { headers });
    return { status: r.status, headers: r.headers, json: (await r.json().catch(() => null)) as any };
  };

  let limiterIp = 0;
  const ip = () => `198.51.${Math.floor(limiterIp / 250)}.${limiterIp++ % 250}`;

  // The user limiter keys on the user id, so every case gets its own user there.
  let limiterUser = 1000;
  const subject = (name: string): Record<string, string> =>
    name === "cameraClaimUserLimiter" ? { "x-test-user": String(++limiterUser) } : { "X-Real-IP": ip() };

  for (const expected of EXPECTED) {
    test(`${expected.name}: ${expected.limit} per ${expected.windowSec}s, draft-7 headers, 429 body`, async () => {
      const who = subject(expected.name);
      const first = await hit(expected.name, who);
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("ratelimit-policy"), `${expected.limit};w=${expected.windowSec}`);
      assert.equal(first.headers.get("x-ratelimit-limit"), null); // legacy headers off

      // Fill the bucket with counted requests (failures always count).
      for (let i = 1; i < expected.limit; i++) {
        assert.equal((await hit(expected.name, who, 400)).status, 400);
      }
      const blocked = await hit(expected.name, who);
      if (expected.skipSuccessful) {
        // the first (successful) request was not counted: one more failure fits
        assert.equal(blocked.status, 200);
        assert.equal((await hit(expected.name, who, 400)).status, 400);
      }
      const limited = expected.skipSuccessful ? await hit(expected.name, who) : blocked;
      assert.equal(limited.status, 429);
      assert.deepEqual(limited.json, { success: false, message: expected.message });
    });
  }

  test("skipSuccessfulRequests limiters: successes never count", async () => {
    const who = { "X-Real-IP": ip() };
    for (let i = 0; i < 15; i++) assert.equal((await hit("itineraryChallengeLimiter", who)).status, 200);
  });

  test("non-skip limiters count successes too", async () => {
    const who = { "X-Real-IP": ip() };
    for (let i = 0; i < 3; i++) assert.equal((await hit("resendVerifyLimiter", who)).status, 200);
    assert.equal((await hit("resendVerifyLimiter", who)).status, 429);
  });

  test("keyed on X-Real-IP: another IP has its own bucket", async () => {
    const a = { "X-Real-IP": ip() };
    for (let i = 0; i < 3; i++) await hit("resendVerifyLimiter", a);
    assert.equal((await hit("resendVerifyLimiter", a)).status, 429);
    assert.equal((await hit("resendVerifyLimiter", { "X-Real-IP": ip() })).status, 200);
  });

  test("IPv6 addresses collapse to their /56", async () => {
    const sameNet = ["2001:db8:abcd:1200::1", "2001:db8:abcd:12ff::2", "2001:db8:abcd:1234:5678::9"];
    for (const addr of sameNet) assert.equal((await hit("resendVerifyLimiter", { "X-Real-IP": addr })).status, 200);
    assert.equal((await hit("resendVerifyLimiter", { "X-Real-IP": "2001:db8:abcd:1201::7" })).status, 429);
    assert.equal((await hit("resendVerifyLimiter", { "X-Real-IP": "2001:db8:abcd:1300::1" })).status, 200);
  });

  test("no X-Real-IP → keyed on the socket address (all such callers share one bucket)", async () => {
    for (let i = 0; i < 5; i++) assert.equal((await hit("registerLimiter")).status, 200);
    assert.equal((await hit("registerLimiter")).status, 429);
    assert.equal((await hit("registerLimiter", { "X-Real-IP": ip() })).status, 200);
  });

  test("cameraClaimUserLimiter keys on the user id, not the IP; no user → one shared 'none' bucket", async () => {
    const user = { "x-test-user": "77" };
    for (let i = 0; i < 5; i++) {
      assert.equal((await hit("cameraClaimUserLimiter", { ...user, "X-Real-IP": ip() }, 400)).status, 400);
    }
    assert.equal((await hit("cameraClaimUserLimiter", { ...user, "X-Real-IP": ip() }, 400)).status, 429);
    assert.equal((await hit("cameraClaimUserLimiter", { "x-test-user": "78" }, 400)).status, 400);
    for (let i = 0; i < 5; i++) await hit("cameraClaimUserLimiter", { "X-Real-IP": ip() }, 400);
    assert.equal((await hit("cameraClaimUserLimiter", { "X-Real-IP": ip() }, 400)).status, 429);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// clientIp + presets
// ═════════════════════════════════════════════════════════════════════════════

describe("clientIp", () => {
  const fakeReq = (headers: Record<string, unknown>, remoteAddress?: string) =>
    ({ headers, socket: { remoteAddress } }) as unknown as http.IncomingMessage;

  test("X-Real-IP wins, then the socket address, then 'Unknown'", () => {
    assert.equal(clientIp(fakeReq({ "x-real-ip": "203.0.113.1" }, "10.0.0.1")), "203.0.113.1");
    assert.equal(clientIp(fakeReq({}, "10.0.0.1")), "10.0.0.1");
    assert.equal(clientIp(fakeReq({ "x-real-ip": "" }, "10.0.0.1")), "10.0.0.1");
    assert.equal(clientIp(fakeReq({})), "Unknown");
  });

  test("always a string, even if the header arrives as an array (String(...) join)", () => {
    const ip = clientIp(fakeReq({ "x-real-ip": ["203.0.113.1", "198.51.100.2"] }));
    assert.equal(typeof ip, "string");
    assert.equal(ip, "203.0.113.1,198.51.100.2");
  });

  test("X-Forwarded-For is ignored (only nginx's X-Real-IP is trusted)", () => {
    assert.equal(clientIp(fakeReq({ "x-forwarded-for": "1.2.3.4" }, "10.0.0.1")), "10.0.0.1");
  });
});

describe("presets", () => {
  test("every chain starts with RestRequestLogger; auth/ssKey filters follow RequestHeaderFilter", () => {
    for (const [name, chain] of Object.entries(mw)) assert.equal(chain[0], RestRequestLogger, name);
    assert.deepEqual(mw.pub, [RestRequestLogger]);
    assert.deepEqual(mw.std, [RestRequestLogger, RequestHeaderFilter]);
    assert.deepEqual(mw.auth, [RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter]);
    assert.deepEqual(mw.authUpload, [RestRequestLogger, MandatoryTokenFilter]);
    assert.equal(mw.ssKey.length, 3);
    assert.equal(mw.ssKey[1], RequestHeaderFilter);
    assert.equal(mw.housePublic[1], Limiters.houseViewLimiter);
    assert.equal(mw.pdcaPublic[2], RequestHeaderFilter);
  });
});
