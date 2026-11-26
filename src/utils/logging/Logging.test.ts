import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LoggingUtilities, TelegramLogMessage } from "./LoggingUtilities.js";
import { parseRequestLogEntry } from "./RequestLogParser.js";
import { TELEGRAM_LOG_MODULES, TELEGRAM_LOG_MODULE_KEYS, resolveModuleKey } from "./TelegramLogModules.js";
import {
  TelegramLogSubscriptionService,
  clearTelegramLogSubscriptionCaches,
} from "./TelegramLogSubscriptionService.js";
import { buildLogAlertHtml, setupTelegramLogSender } from "./TelegramLogSender.js";
import { TELEGRAM_BOT_TOKEN_ENV } from "../TelegramUtilities.js";
import { IRequestLogContext } from "../../models/IRequestLogContext.js";
import { createRoutes } from "../../app.js";
import type KnexSqlUtilities from "../KnexSqlUtilities.js";
import type { CameraService } from "../../camera/Camera.service.js";

function context(extra: Partial<IRequestLogContext> = {}): IRequestLogContext {
  return {
    requestId: "req_0123456789ab",
    currentStage: "middleware",
    startTime: Date.now(),
    method: "POST",
    path: "/todo/abc/update?x=1",
    ip: "203.0.113.9",
    events: [],
    ...extra,
  };
}

// ── render() → RequestLogParser round trip (the Log Searcher reads what render() writes) ──

describe("RequestLogParser matches LoggingUtilities.render()", () => {
  test("header, fields, stages, children, detail, durations, stack and response survive a round trip", () => {
    const ctx = context({ payload: { title: "Milk", done: true } });
    const header = LoggingUtilities.request.branch(ctx, "VALIDATION", "General headers");
    header.children.push("(M) 'user-agent' ok");
    ctx.currentStage = "controller";
    const validation = LoggingUtilities.request.branch(ctx, "VALIDATION", "Request body", "1 field");
    validation.children.push("(O) 'title' string ok");
    const sql = LoggingUtilities.request.branch(ctx, "SQL", "Update task", "updated", 7);
    sql.children.push("tb_todo_task.update() - 3ms");
    LoggingUtilities.request.exception(ctx, "TodoController.POST /:id/update", new Error("db exploded"));
    LoggingUtilities.request.response(ctx, 500, { code: 500, status: "Ko", data: "Failed" });

    const entry = parseRequestLogEntry(LoggingUtilities.request.render(ctx, 42).join("\n"));
    assert.ok(entry);
    assert.equal(entry.requestId, "req_0123456789ab");
    assert.equal(entry.method, "POST");
    assert.equal(entry.path, "/todo/abc/update?x=1");
    assert.equal(entry.ip, "203.0.113.9");
    assert.deepEqual(JSON.parse(entry.payload!), { title: "Milk", done: true });
    assert.equal(entry.statusCode, 500);
    assert.equal(entry.statusText, "Internal Server Error");
    assert.deepEqual(JSON.parse(entry.response!), { code: 500, status: "Ko", data: "Failed" });
    assert.equal(entry.durationMs, 42);

    assert.deepEqual(
      entry.events.map((e) => [e.stage, e.type, e.message]),
      [
        ["middleware", "VALIDATION", "General headers"],
        ["controller", "VALIDATION", "Request body"],
        ["service", "SQL", "Update task"],
        ["controller", "ERROR", "Unhandled exception in TodoController.POST /:id/update"],
      ],
    );
    assert.deepEqual(entry.events[0].lines, ["(M) 'user-agent' ok"]);
    assert.deepEqual(entry.events[1].lines, ["(O) 'title' string ok", "1 field"]);
    assert.deepEqual(entry.events[2].lines, ["tb_todo_task.update() - 3ms", "updated"]);
    assert.equal(entry.events[2].durationMs, 7);
    const error = entry.events[3];
    assert.equal(error.isError, true);
    assert.deepEqual(error.lines, ["Error: db exploded"]);
    assert.ok(error.stack.length > 0);
    assert.ok(error.stack.every((frame) => frame.startsWith("at ")));
  });

  test("a success body over the line cap is truncated in the log but still parses", () => {
    const ctx = context({ method: "GET", path: "/todo" });
    LoggingUtilities.request.response(ctx, 200, {
      data: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i])),
    });
    const entry = parseRequestLogEntry(LoggingUtilities.request.render(ctx, 1).join("\n"));
    assert.equal(entry?.statusCode, 200);
    assert.match(entry!.response!, /… \(\d+ more lines\)$/);
    assert.deepEqual(entry!.events, []);
  });
});

describe("LoggingUtilities.request.exception", () => {
  test("shows the wrapped driver error's name/code as the cause", () => {
    const ctx = context();
    const driver = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    const wrapped = Object.assign(new Error("Insert failed: Duplicate entry"), { cause: driver });
    LoggingUtilities.request.exception(ctx, "X", wrapped);
    assert.equal(ctx.events[0].detail, "Error: Insert failed: Duplicate entry (cause: Error ER_DUP_ENTRY)");
  });

  test("no cause → detail unchanged; error text is sanitised", () => {
    const ctx = context();
    LoggingUtilities.request.exception(ctx, "X", new Error('bad {"password":"hunter2"}'));
    assert.equal(ctx.events[0].detail, 'Error: bad {"password":"[REDACTED]"}');
  });
});

// ── Module registry ──

describe("TelegramLogModules", () => {
  test("every Express prefix in the route table (app.ts) maps to a module key", () => {
    const prefixes = createRoutes({} as KnexSqlUtilities, {} as CameraService).map(([prefix]) => prefix);
    assert.ok(prefixes.length > 20, "route table not found");
    for (const prefix of prefixes) assert.ok(resolveModuleKey(prefix), `no Telegram log module for ${prefix}`);
  });

  test("routes resolve by longest prefix; house covers both house prefixes", () => {
    assert.equal(resolveModuleKey("/todo/abc/update"), "todo");
    assert.equal(resolveModuleKey("/house-layout/1"), "house");
    assert.equal(resolveModuleKey("/house/share"), "house");
    assert.equal(resolveModuleKey("/house/view/tok"), "house");
    assert.equal(resolveModuleKey("/camera/device"), "camera");
    assert.equal(resolveModuleKey("/pdca/enquiry"), "pdca");
    assert.equal(resolveModuleKey("/v2/ss/ap/sms"), "siri-shortcut");
    assert.equal(resolveModuleKey("/todoX"), null);
    assert.equal(resolveModuleKey("/nope"), null);
  });

  test("admin listing has one row per key with every prefix", () => {
    const keys = TELEGRAM_LOG_MODULE_KEYS.map((m) => m.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(new Set(TELEGRAM_LOG_MODULES.map((m) => m.key)).size, keys.length);
    assert.deepEqual(TELEGRAM_LOG_MODULE_KEYS.find((m) => m.key === "house")?.paths, ["/house-layout", "/house"]);
    assert.deepEqual(TELEGRAM_LOG_MODULE_KEYS.find((m) => m.key === "siri-shortcut")?.paths, ["/v1/ss", "/v2/ss"]);
  });
});

// ── Subscription service (fake DB) ──

type Row = Record<string, unknown>;

function fakeDb(chats: Row[], overrides: Row[] = []) {
  const calls: { op: string; args: unknown[] }[] = [];
  const db = {
    async raw(sql: string, bindings: unknown[]) {
      calls.push({ op: "raw", args: [sql, bindings] });
      return sql.includes("tb_tg_stats_whitelist") ? chats : overrides.filter((o) => o.record_status === "A");
    },
    async findOne(_t: string, where: Row, columns: readonly string[]) {
      calls.push({ op: "findOne", args: [where, columns] });
      const row = overrides.find((o) => Object.entries(where).every(([k, v]) => o[k] === v));
      return row ? Object.fromEntries(columns.map((c) => [c, row[c]])) : undefined;
    },
    async update(_t: string, where: Row, data: Row) {
      calls.push({ op: "update", args: [where, data] });
      return [];
    },
    async insert(_t: string, data: Row) {
      calls.push({ op: "insert", args: [data] });
      overrides.push({ id: 99, record_status: "A", ...data });
      return data;
    },
  };
  return { db: db as never, calls };
}

describe("TelegramLogSubscriptionService", () => {
  beforeEach(() => clearTelegramLogSubscriptionCaches());

  const chats = [
    { telegram_user_id: 1, telegram_chat_id: 11 },
    { telegram_user_id: 2, telegram_chat_id: 22 },
  ];

  test("matrix: every module defaults to on; active overrides apply per chat", async () => {
    const { db, calls } = fakeDb(chats, [
      { chat_id: 11, module_key: "todo", is_enabled: 0, record_status: "A" },
      { chat_id: 22, module_key: "auth", is_enabled: 0, record_status: "D" },
    ]);
    const matrix = await new TelegramLogSubscriptionService(db).listMatrix();
    assert.equal(matrix.modules, TELEGRAM_LOG_MODULE_KEYS);
    assert.deepEqual(
      matrix.chats.map((c) => [c.chatId, c.label]),
      [
        [11, "User 1"],
        [22, "User 2"],
      ],
    );
    assert.equal(matrix.chats[0].enabled.todo, false);
    assert.equal(matrix.chats[0].enabled.auth, true);
    assert.equal(matrix.chats[1].enabled.auth, true);
    assert.equal(Object.keys(matrix.chats[1].enabled).length, TELEGRAM_LOG_MODULE_KEYS.length);
    // Status is a binding, never inlined.
    for (const call of calls.filter((c) => c.op === "raw")) {
      assert.ok(!String(call.args[0]).includes("'A'"));
      assert.deepEqual(call.args[1], ["A"]);
    }
  });

  test("subscribed chat ids are cached", async () => {
    const { db, calls } = fakeDb(chats);
    const svc = new TelegramLogSubscriptionService(db);
    assert.deepEqual(await svc.listSubscribedChatIdsCached(), [11, 22]);
    assert.deepEqual(await svc.listSubscribedChatIdsCached(), [11, 22]);
    assert.equal(calls.length, 1);
  });

  test("setEnabled inserts the first override, updates an existing one, and refreshes the cache", async () => {
    const overrides: Row[] = [];
    const { db, calls } = fakeDb(chats, overrides);
    const svc = new TelegramLogSubscriptionService(db);
    assert.equal(await svc.isEnabled(11, "todo"), true);

    await svc.setEnabled(11, "todo", false);
    assert.equal(calls.filter((c) => c.op === "insert").length, 1);
    assert.equal(await svc.isEnabled(11, "todo"), false);

    await svc.setEnabled(11, "todo", true);
    const update = calls.find((c) => c.op === "update")!;
    assert.deepEqual(update.args[0], { id: 99 });
    assert.equal((update.args[1] as Row).is_enabled, 1);
    assert.equal(await svc.isEnabled(11, "todo"), true);
    // Lookups select only what they need and filter on the active status.
    const lookups = calls.filter((c) => c.op === "findOne");
    assert.deepEqual(lookups[0].args, [{ chat_id: 11, module_key: "todo", record_status: "A" }, ["is_enabled"]]);
    assert.deepEqual(lookups[1].args[1], ["id"]);
  });

  test("records its SQL in the request tree when given a log context", async () => {
    const { db } = fakeDb(chats);
    const ctx = context({ currentStage: "controller" });
    await new TelegramLogSubscriptionService(db).listMatrix(ctx);
    assert.deepEqual(
      ctx.events.map((e) => [e.type, e.stage]),
      [["SERVICE", "service"]],
    );
  });
});

// ── Log sender ──

describe("TelegramLogSender", () => {
  test("public Log Searcher URLs become a link; localhost ones a copyable code; both escaped", () => {
    assert.equal(
      buildLogAlertHtml({ html: "<code>x</code>", logSearcherUrl: "https://awense.com/l?requestId=a&b" }),
      '<code>x</code>\n<a href="https://awense.com/l?requestId=a&amp;b">View Verbose Logs</a>',
    );
    assert.equal(
      buildLogAlertHtml({ html: "x", logSearcherUrl: "http://localhost:5173/l?requestId=a" }),
      "x\nView Verbose Logs: <code>http://localhost:5173/l?requestId=a</code>",
    );
    assert.equal(
      buildLogAlertHtml({ html: "x", logSearcherUrl: "https://localhost/l" }),
      "x\nView Verbose Logs: <code>https://localhost/l</code>",
    );
    assert.equal(buildLogAlertHtml({ html: "x" }), "x");
  });

  test("with a token, alerts go to each chat; a failed send never throws", async () => {
    const previousToken = process.env[TELEGRAM_BOT_TOKEN_ENV];
    const realFetch = globalThis.fetch;
    const sent: { url: string; chatId: unknown }[] = [];
    let status = 200;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(input), chatId: JSON.parse(String(init?.body)).chat_id });
      return new Response("{}", { status });
    }) as typeof fetch;
    process.env[TELEGRAM_BOT_TOKEN_ENV] = "tok";
    let registered: ((m: TelegramLogMessage, chatId: number) => void) | null = null;
    const realSet = LoggingUtilities.setLogSender;
    LoggingUtilities.setLogSender = (fn) => {
      registered = fn;
    };
    try {
      setupTelegramLogSender();
      assert.ok(registered);
      const send = registered as (m: TelegramLogMessage, chatId: number) => void;
      send({ html: "a" }, 11);
      status = 500;
      send({ html: "b" }, 22); // non-OK → console warning only
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(
        sent.map((s) => s.chatId),
        [11, 22],
      );
      assert.equal(sent[0].url, "https://api.telegram.org/bottok/sendMessage");
    } finally {
      LoggingUtilities.setLogSender = realSet;
      globalThis.fetch = realFetch;
      if (previousToken === undefined) delete process.env[TELEGRAM_BOT_TOKEN_ENV];
      else process.env[TELEGRAM_BOT_TOKEN_ENV] = previousToken;
    }
  });

  test("without a token no sender is registered", () => {
    const previousToken = process.env[TELEGRAM_BOT_TOKEN_ENV];
    process.env[TELEGRAM_BOT_TOKEN_ENV] = "";
    let registered = false;
    const realSet = LoggingUtilities.setLogSender;
    LoggingUtilities.setLogSender = () => {
      registered = true;
    };
    try {
      setupTelegramLogSender();
      assert.equal(registered, false);
    } finally {
      LoggingUtilities.setLogSender = realSet;
      if (previousToken === undefined) delete process.env[TELEGRAM_BOT_TOKEN_ENV];
      else process.env[TELEGRAM_BOT_TOKEN_ENV] = previousToken;
    }
  });
});
