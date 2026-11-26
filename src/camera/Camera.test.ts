import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { RequestHandler } from "express";
import cookieParser from "cookie-parser";
import tokenFilterDb from "../config/db/mysql.js";
import { signToken } from "../token/Token.service.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import createCameraController from "./Camera.controller.js";
import { CameraService, UNCLAIMED_RETENTION_MS, toCameraDeviceDto } from "./Camera.service.js";
import { CameraRelay, RelaySocket } from "./Camera.relay.js";
import { MAX_LIVE_PAIRING_CODES, PairingCodeStore } from "./Camera.pairing.js";
import {
  DEVICE_NAME_MAX_LENGTH,
  isWellFormedDeviceToken,
  validateClaimBody,
  validateDeviceIdParam,
  validateRegisterBody,
} from "./Camera.validator.js";
import {
  CAMERA_MAX_ACK_ERROR_LENGTH,
  CAMERA_MAX_REQUEST_ID_LENGTH,
  encodeFramePacket,
  parseCommand,
  parseJsonMessage,
  sanitiseAck,
  sanitiseStatus,
} from "./Camera.protocol.js";

// Validators, mapper, protocol sanitising, CameraService rules (fake DB) and the /camera REST
// routes in-process (real controller, limiters and MandatoryTokenFilter; fake DB). Nothing
// leaves the machine. Socket handling is in Camera.ws.test.ts, relay logic in Camera.relay.test.ts.

type Row = Record<string, any>;

const DEVICE_TABLE = "tb_camera_device";
const USER_TABLE = "tb_aa_user";
const TOKEN = "t".repeat(43);
const DEVICE_A = "aaaaaaaa-0000-4000-8000-000000000001";

const isInvalid = (field: string) => (err: InstanceType<typeof Exceptions.InvalidRequest>) => {
  assert.equal(err.code, `invalid_request_${field}`);
  assert.equal(err.httpStatus, 400);
  return true;
};

/** Minimal KnexSqlUtilities stand-in: equality WHERE, honours `columns`, records raw SQL. */
function fakeDb() {
  const tables: Record<string, Row[]> = { [DEVICE_TABLE]: [], [USER_TABLE]: [] };
  const raws: { sql: string; bindings: unknown[] }[] = [];
  let nextId = 1;
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const pick = (row: Row, columns?: readonly string[]) =>
    !columns || columns.includes("*") ? { ...row } : Object.fromEntries(columns.map((c) => [c, row[c]]));
  const db = {
    tables,
    raws,
    async findOne(table: string, where: Row, columns?: readonly string[]) {
      const row = tables[table].find((r) => matches(r, where));
      return row ? pick(row, columns) : undefined;
    },
    async find(table: string, where: Row, opts: { orderBy?: string; columns?: readonly string[] } = {}) {
      const rows = tables[table].filter((r) => matches(r, where));
      if (opts.orderBy) rows.sort((a, b) => (a[opts.orderBy!] ?? 0) - (b[opts.orderBy!] ?? 0));
      return rows.map((r) => pick(r, opts.columns));
    },
    async insert(table: string, data: Row) {
      const row = { id: nextId++, ...data };
      tables[table].push(row);
      return { ...row };
    },
    async update(table: string, where: Row, data: Row) {
      const hit = tables[table].filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return tables[table].filter((r) => matches(r, where)).map((r) => ({ ...r }));
    },
    async raw(sql: string, bindings: unknown[]) {
      raws.push({ sql, bindings });
      return [];
    },
  };
  return db;
}

function device(over: Row = {}): Row {
  return {
    uuid: DEVICE_A,
    token_hash: sha256Hex(TOKEN),
    user_id: null,
    name: "iPhone 13",
    paired_dt: null,
    last_seen_dt: null,
    record_status: RecordStatus.ACTIVE,
    created_dt: 1,
    ...over,
  };
}

class NullSocket implements RelaySocket {
  bufferedAmount = 0;
  sent: string[] = [];
  closedWith: number | undefined;
  send(data: Buffer | string): void {
    if (typeof data === "string") this.sent.push(data);
  }
  close(code?: number): void {
    this.closedWith = code;
  }
}

function setup() {
  const db = fakeDb();
  const relay = new CameraRelay();
  const pairing = new PairingCodeStore();
  const service = new CameraService(db as never, relay, pairing, () => TOKEN);
  return { db, relay, pairing, service };
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

describe("validateRegisterBody", () => {
  test("name is required, trimmed, stripped of control characters and capped at the column", () => {
    assert.deepEqual(validateRegisterBody({ name: "  iPhone\u0000 13\n " }), { name: "iPhone 13" });
    assert.throws(() => validateRegisterBody({}), isInvalid("name"));
    assert.throws(() => validateRegisterBody({ name: "   " }), isInvalid("name"));
    assert.throws(() => validateRegisterBody({ name: "\u0001\u0002" }), isInvalid("name"));
    assert.throws(() => validateRegisterBody({ name: 42 }), isInvalid("name"));
    assert.equal(
      validateRegisterBody({ name: "x".repeat(DEVICE_NAME_MAX_LENGTH) }).name.length,
      DEVICE_NAME_MAX_LENGTH,
    );
    assert.throws(() => validateRegisterBody({ name: "x".repeat(DEVICE_NAME_MAX_LENGTH + 1) }), isInvalid("name"));
  });

  test("credentials are all-or-nothing; malformed ones are dropped, not rejected", () => {
    assert.deepEqual(validateRegisterBody({ name: "a", deviceId: DEVICE_A, token: TOKEN }), {
      name: "a",
      deviceId: DEVICE_A,
      token: TOKEN,
    });
    assert.deepEqual(validateRegisterBody({ name: "a", deviceId: DEVICE_A }), { name: "a" });
    assert.deepEqual(validateRegisterBody({ name: "a", token: TOKEN }), { name: "a" });
    assert.deepEqual(validateRegisterBody({ name: "a", deviceId: "nope", token: TOKEN }), { name: "a" });
    assert.deepEqual(validateRegisterBody({ name: "a", deviceId: DEVICE_A, token: "short" }), { name: "a" });
    assert.deepEqual(validateRegisterBody({ name: "a", deviceId: DEVICE_A, token: `${TOKEN}!` }), { name: "a" });
  });
});

describe("validateClaimBody", () => {
  test("code must be 6 digits; spaces are ignored", () => {
    assert.deepEqual(validateClaimBody({ code: "123 456" }), { code: "123456" });
    for (const code of [undefined, 123456, "12345", "1234567", "12345a", ""]) {
      assert.throws(() => validateClaimBody({ code }), isInvalid("code"));
    }
  });

  test("name is optional; blank means keep the phone's name; capped at the column", () => {
    assert.deepEqual(validateClaimBody({ code: "123456", name: " Left " }), { code: "123456", name: "Left" });
    assert.deepEqual(validateClaimBody({ code: "123456", name: "   " }), { code: "123456" });
    assert.deepEqual(validateClaimBody({ code: "123456", name: null }), { code: "123456" });
    assert.throws(() => validateClaimBody({ code: "123456", name: 1 }), isInvalid("name"));
    assert.throws(
      () => validateClaimBody({ code: "123456", name: "x".repeat(DEVICE_NAME_MAX_LENGTH + 1) }),
      isInvalid("name"),
    );
  });
});

test("validateDeviceIdParam accepts UUIDs only", () => {
  assert.equal(validateDeviceIdParam(DEVICE_A), DEVICE_A);
  assert.throws(() => validateDeviceIdParam("1"), isInvalid("deviceId"));
  assert.throws(() => validateDeviceIdParam(`${DEVICE_A}x`), isInvalid("deviceId"));
});

test("isWellFormedDeviceToken", () => {
  assert.equal(isWellFormedDeviceToken(TOKEN), true);
  assert.equal(isWellFormedDeviceToken("a".repeat(19)), false);
  assert.equal(isWellFormedDeviceToken("a".repeat(101)), false);
  assert.equal(isWellFormedDeviceToken(`${"a".repeat(30)} `), false);
  assert.equal(isWellFormedDeviceToken(undefined), false);
});

// ---------------------------------------------------------------------------
// Mapper + protocol sanitising
// ---------------------------------------------------------------------------

test("toCameraDeviceDto maps to camelCase and turns BIGINT strings into numbers", () => {
  const row = device({ paired_dt: "1700000000000", last_seen_dt: null }) as never;
  assert.deepEqual(toCameraDeviceDto(row, true), {
    deviceId: DEVICE_A,
    name: "iPhone 13",
    online: true,
    pairedAt: 1700000000000,
    lastSeenAt: null,
  });
});

describe("protocol sanitising", () => {
  test("status: unknown fields dropped, wrong types defaulted, arrays and primitives rejected", () => {
    const status = sanitiseStatus({
      recording: "yes",
      elapsedMs: -5,
      quality: "8k",
      batteryLevel: Number.NaN,
      thermalState: "melting",
      previewFps: Infinity,
      __proto__: { polluted: true },
      extra: 1,
    });
    assert.deepEqual(status, {
      recording: false,
      startedAtMs: null,
      elapsedMs: 0,
      quality: "4k",
      batteryLevel: null,
      charging: false,
      freeBytes: 0,
      thermalState: "nominal",
      droppedFrames: 0,
      hasAudio: false,
      previewFps: 0,
    });
    assert.equal(sanitiseStatus([1, 2]), null);
    assert.equal(sanitiseStatus("x"), null);
    assert.equal(sanitiseStatus(null), null);
  });

  test("ack: unknown command rejected, strings clipped", () => {
    assert.equal(sanitiseAck({ command: "explode" }), null);
    const ack = sanitiseAck({
      command: "stop",
      requestId: "r".repeat(500),
      ok: 1,
      error: "e".repeat(500),
      startedAtMs: "123",
    });
    assert.deepEqual(ack, {
      command: "stop",
      requestId: "r".repeat(CAMERA_MAX_REQUEST_ID_LENGTH),
      ok: false,
      error: "e".repeat(CAMERA_MAX_ACK_ERROR_LENGTH),
      startedAtMs: null,
    });
  });

  test("commands: type, target and quality are checked", () => {
    assert.equal(parseCommand({ type: "rm -rf", target: "all" }), null);
    assert.equal(parseCommand({ type: "start", target: "" }), null);
    assert.equal(parseCommand({ type: "start", target: "x".repeat(65) }), null);
    assert.equal(parseCommand({ type: "start", target: 1 }), null);
    assert.equal(parseCommand({ type: "set_quality", target: "all" }), null);
    assert.deepEqual(parseCommand({ type: "start", target: "all", requestId: 5 }), {
      type: "start",
      target: "all",
      requestId: null,
    });
  });

  test("JSON messages need an object with a string type", () => {
    for (const text of ["", "null", "1", '"x"', "[]", "{}", '{"type":1}', "{bad json"]) {
      assert.equal(parseJsonMessage(text), null, text);
    }
    assert.deepEqual(parseJsonMessage('{"type":"status"}'), { type: "status" });
  });

  test("frame packets: [length][deviceId][jpeg]", () => {
    const packet = encodeFramePacket(DEVICE_A, Buffer.from([0xff, 0xd8]));
    assert.equal(packet[0], DEVICE_A.length);
    assert.equal(packet.subarray(1, 1 + DEVICE_A.length).toString("ascii"), DEVICE_A);
    assert.deepEqual([...packet.subarray(1 + DEVICE_A.length)], [0xff, 0xd8]);
    assert.throws(() => encodeFramePacket("x".repeat(256), Buffer.alloc(1)));
  });
});

// ---------------------------------------------------------------------------
// CameraService
// ---------------------------------------------------------------------------

describe("CameraService", () => {
  test("register without credentials creates a device, returns the token once and stores only its hash", async () => {
    const { db, service } = setup();
    const res = await service.register({ name: "iPhone 13" });
    assert.equal(res.token, TOKEN);
    assert.equal(res.paired, false);
    assert.match(res.pairingCode!, /^\d{6}$/);
    assert.equal(typeof res.pairingExpiresAt, "number");
    const [row] = db.tables[DEVICE_TABLE];
    assert.equal(row.uuid, res.deviceId);
    assert.equal(row.token_hash, sha256Hex(TOKEN));
    assert.equal(JSON.stringify(row).includes(TOKEN), false);
    assert.equal(row.user_id, null);
  });

  test("register retires unclaimed devices older than 24 h (bound statuses, no inline 'A'/'D')", async () => {
    const { db, service } = setup();
    const before = Date.now();
    await service.register({ name: "x" });
    const [{ sql, bindings }] = db.raws;
    assert.match(sql, /user_id IS NULL/);
    assert.doesNotMatch(sql, /'[AD]'/);
    assert.equal(bindings[0], RecordStatus.DELETED);
    assert.equal(bindings[2], RecordStatus.ACTIVE);
    assert.ok((bindings[3] as number) <= Date.now() - UNCLAIMED_RETENTION_MS);
    assert.ok((bindings[3] as number) >= before - UNCLAIMED_RETENTION_MS);
  });

  test("register with valid credentials keeps the identity and returns token null", async () => {
    const { db, service } = setup();
    db.tables[DEVICE_TABLE].push(device());
    const res = await service.register({ name: "x", deviceId: DEVICE_A, token: TOKEN });
    assert.equal(res.deviceId, DEVICE_A);
    assert.equal(res.token, null);
    assert.match(res.pairingCode!, /^\d{6}$/);
    assert.equal(db.tables[DEVICE_TABLE].length, 1);
    assert.equal(db.raws.length, 0);
  });

  test("register of a bound device answers paired with no code", async () => {
    const { db, service, pairing } = setup();
    db.tables[DEVICE_TABLE].push(device({ user_id: 7 }));
    const res = await service.register({ name: "x", deviceId: DEVICE_A, token: TOKEN });
    assert.deepEqual(res, { deviceId: DEVICE_A, token: null, paired: true, pairingCode: null, pairingExpiresAt: null });
    assert.equal(pairing.size, 0);
  });

  test("a token for another deviceId, or a deleted device, gets a brand new identity", async () => {
    const { db, service } = setup();
    db.tables[DEVICE_TABLE].push(device({ uuid: "bbbbbbbb-0000-4000-8000-000000000002" }));
    const res = await service.register({ name: "x", deviceId: DEVICE_A, token: TOKEN });
    assert.notEqual(res.deviceId, DEVICE_A);
    assert.equal(res.token, TOKEN);

    const other = setup();
    other.db.tables[DEVICE_TABLE].push(device({ record_status: RecordStatus.DELETED }));
    const again = await other.service.register({ name: "x", deviceId: DEVICE_A, token: TOKEN });
    assert.notEqual(again.deviceId, DEVICE_A);
  });

  test("re-registering issues a fresh code and revokes the previous one", async () => {
    const { db, service, pairing } = setup();
    db.tables[DEVICE_TABLE].push(device());
    const first = await service.register({ name: "x", deviceId: DEVICE_A, token: TOKEN });
    const second = await service.register({ name: "x", deviceId: DEVICE_A, token: TOKEN });
    assert.equal(pairing.size, 1);
    if (first.pairingCode !== second.pairingCode) assert.equal(pairing.claim(first.pairingCode!), null);
  });

  test("authenticateDevice: malformed tokens never hit the DB; unknown ones are null", async () => {
    const { db, service } = setup();
    let lookups = 0;
    const findOne = db.findOne;
    db.findOne = async (...args: Parameters<typeof findOne>) => {
      lookups++;
      return findOne(...args);
    };
    assert.equal(await service.authenticateDevice("bad token"), null);
    assert.equal(lookups, 0);
    assert.equal(await service.authenticateDevice("u".repeat(43)), null);
    db.tables[DEVICE_TABLE].push(device({ user_id: 3 }));
    assert.deepEqual(await service.authenticateDevice(TOKEN), { deviceId: DEVICE_A, userId: 3, name: "iPhone 13" });
  });

  test("claim binds the device, renames it, tells the relay and consumes the code", async () => {
    const { db, relay, service } = setup();
    db.tables[DEVICE_TABLE].push(device());
    const phone = new NullSocket();
    relay.addPhone(phone, { deviceId: DEVICE_A, userId: null, name: "iPhone 13" });
    const { pairingCode } = await service.register({ name: "x", deviceId: DEVICE_A, token: TOKEN });

    const dto = await service.claim(7, { code: pairingCode!, name: "Left" });
    assert.equal(dto.deviceId, DEVICE_A);
    assert.equal(dto.name, "Left");
    assert.equal(dto.online, true);
    assert.equal(typeof dto.pairedAt, "number");
    assert.equal(db.tables[DEVICE_TABLE][0].user_id, 7);
    assert.deepEqual(JSON.parse(phone.sent.at(-1)!), { type: "paired", name: "Left" });
    await assert.rejects(service.claim(8, { code: pairingCode! }), isInvalid("code"));
  });

  test("claim without a name keeps the phone's name", async () => {
    const { db, service } = setup();
    db.tables[DEVICE_TABLE].push(device());
    const { pairingCode } = await service.register({ name: "x", deviceId: DEVICE_A, token: TOKEN });
    const dto = await service.claim(7, { code: pairingCode! });
    assert.equal(dto.name, "iPhone 13");
    assert.equal(dto.online, false);
  });

  test("claim of an unknown code, or of a device that was bound or removed meanwhile, is 400 code", async () => {
    const { db, pairing, service } = setup();
    await assert.rejects(service.claim(7, { code: "000000" }), isInvalid("code"));

    db.tables[DEVICE_TABLE].push(device({ user_id: 9 }));
    await assert.rejects(service.claim(7, { code: pairing.issue(DEVICE_A).code }), isInvalid("code"));
    db.tables[DEVICE_TABLE][0].record_status = RecordStatus.DELETED;
    db.tables[DEVICE_TABLE][0].user_id = null;
    await assert.rejects(service.claim(7, { code: pairing.issue(DEVICE_A).code }), isInvalid("code"));
    assert.equal(db.tables[DEVICE_TABLE][0].user_id, null);
  });

  test("list returns only the user's active devices with live online flags", async () => {
    const { db, relay, service } = setup();
    const B = "bbbbbbbb-0000-4000-8000-000000000002";
    db.tables[DEVICE_TABLE].push(
      device({ user_id: 7, paired_dt: 2 }),
      device({ uuid: B, user_id: 7, paired_dt: 1, last_seen_dt: "5" }),
      device({ uuid: "c", user_id: 8 }),
      device({ uuid: "d", user_id: 7, record_status: RecordStatus.DELETED }),
    );
    relay.addPhone(new NullSocket(), { deviceId: DEVICE_A, userId: 7, name: "a" });
    const list = await service.list(7);
    assert.deepEqual(
      list.map((d) => [d.deviceId, d.online, d.lastSeenAt]),
      [
        [B, false, 5],
        [DEVICE_A, true, null],
      ],
    );
  });

  test("remove soft-deletes the owner's device, revokes its code and closes its socket with 4401", async () => {
    const { db, relay, pairing, service } = setup();
    db.tables[DEVICE_TABLE].push(device({ user_id: 7 }));
    const phone = new NullSocket();
    relay.addPhone(phone, { deviceId: DEVICE_A, userId: 7, name: "a" });
    pairing.issue(DEVICE_A);

    assert.deepEqual(await service.remove(7, DEVICE_A), { deviceId: DEVICE_A });
    assert.equal(db.tables[DEVICE_TABLE][0].record_status, RecordStatus.DELETED);
    assert.equal(pairing.size, 0);
    assert.equal(phone.closedWith, 4401);
    assert.equal(relay.isOnline(DEVICE_A), false);
  });

  test("remove of someone else's device is 404 and changes nothing", async () => {
    const { db, relay, service } = setup();
    db.tables[DEVICE_TABLE].push(device({ user_id: 8 }));
    const phone = new NullSocket();
    relay.addPhone(phone, { deviceId: DEVICE_A, userId: 8, name: "a" });
    await assert.rejects(service.remove(7, DEVICE_A), (err: InstanceType<typeof Exceptions.NotFound>) => {
      assert.equal(err.httpStatus, 404);
      return true;
    });
    assert.equal(db.tables[DEVICE_TABLE][0].record_status, RecordStatus.ACTIVE);
    assert.equal(phone.closedWith, undefined);
  });

  test("the pairing store refuses beyond its memory cap with a typed 500", () => {
    const store = new PairingCodeStore();
    for (let i = 0; i < MAX_LIVE_PAIRING_CODES; i++) store.issue(`d${i}`);
    assert.throws(
      () => store.issue("one-too-many"),
      (err: InstanceType<typeof Exceptions.EntityCreation>) => err.httpStatus === 500,
    );
  });

  test("the pairing store retries on a code collision", () => {
    const sequence = [42, 42, 7];
    const store = new PairingCodeStore(undefined, undefined, () => sequence.shift()!);
    assert.equal(store.issue("a").code, "000042");
    assert.equal(store.issue("b").code, "000007");
  });
});

// ---------------------------------------------------------------------------
// HTTP: /camera REST routes in-process
// ---------------------------------------------------------------------------

describe("HTTP /camera", () => {
  const CSRF = "csrf-test-token";
  const ctx = setup();
  const { db } = ctx;
  let server: Server;
  let base: string;
  let ipCounter = 0;
  const previousSecret = process.env.JWT_SECRET;

  function userWithSession(id: number): string {
    const user = { id, username: `user${id}`, system: "fnd", roles: "[]", record_status: RecordStatus.ACTIVE } as Row;
    user.username_system = `${user.username}_fnd`;
    user.token = signToken({ id, username: user.username, system: "fnd", roles: [], lastLoggedInDt: 0 });
    db.tables[USER_TABLE].push(user);
    return user.token;
  }

  async function call(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; session?: string; csrf?: boolean; ip?: string } = {},
  ) {
    const headers: Record<string, string> = { "x-real-ip": opts.ip ?? `10.0.0.${++ipCounter}` };
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
      headers,
      body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
    });
    return { status: res.status, json: (await res.json()) as any };
  }

  before(async () => {
    process.env.JWT_SECRET = "test-secret";
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
    app.use("/camera", createCameraController(ctx.service));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/camera`;
  });

  after(async () => {
    mock.restoreAll();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("register is public and returns the frozen shape", async () => {
    const { status, json } = await call("POST", "/device/register", { body: { name: "iPhone 13" } });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json.data).sort(), ["deviceId", "paired", "pairingCode", "pairingExpiresAt", "token"]);
    assert.equal(json.data.token, TOKEN);
  });

  test("register without a name is 400 invalid_request_name", async () => {
    const { status, json } = await call("POST", "/device/register", { body: {} });
    assert.equal(status, 400);
    assert.equal(json.data.code, "invalid_request_name");
  });

  test("register is limited to 30 per hour per IP", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 30; i++) {
      assert.equal((await call("POST", "/device/register", { body: { name: "x" }, ip })).status, 200);
    }
    assert.equal((await call("POST", "/device/register", { body: { name: "x" }, ip })).status, 429);
  });

  test("claim, list and delete need a session (401) and claim/delete need CSRF (403)", async () => {
    assert.equal((await call("POST", "/device/claim", { body: { code: "123456" } })).status, 401);
    assert.equal((await call("GET", "/device")).status, 401);
    assert.equal((await call("POST", `/device/${DEVICE_A}/delete`)).status, 401);
    const session = userWithSession(100);
    const noCsrf = await call("POST", "/device/claim", { body: { code: "123456" }, session, csrf: false });
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.json.status, "csrf_invalid");
    assert.equal((await call("POST", `/device/${DEVICE_A}/delete`, { session, csrf: false })).status, 403);
  });

  test("happy path: register → claim → list → delete", async () => {
    const session = userWithSession(101);
    const reg = (await call("POST", "/device/register", { body: { name: "iPhone 13" } })).json.data;

    const claimed = await call("POST", "/device/claim", {
      body: { code: `${reg.pairingCode.slice(0, 3)} ${reg.pairingCode.slice(3)}`, name: "Left" },
      session,
    });
    assert.equal(claimed.status, 200);
    assert.deepEqual(Object.keys(claimed.json.data).sort(), ["deviceId", "lastSeenAt", "name", "online", "pairedAt"]);
    assert.equal(claimed.json.data.deviceId, reg.deviceId);
    assert.equal(claimed.json.data.name, "Left");

    const list = await call("GET", "/device", { session });
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.json.data.map((d: Row) => d.deviceId),
      [reg.deviceId],
    );

    const other = userWithSession(102);
    const foreign = await call("POST", `/device/${reg.deviceId}/delete`, { session: other });
    assert.equal(foreign.status, 404);
    assert.equal(foreign.json.data.code, "entity_not_found");

    const removed = await call("POST", `/device/${reg.deviceId}/delete`, { session });
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.json.data, { deviceId: reg.deviceId });
    assert.deepEqual((await call("GET", "/device", { session })).json.data, []);
  });

  test("delete with a malformed deviceId is 400", async () => {
    const session = userWithSession(103);
    const res = await call("POST", "/device/not-a-uuid/delete", { session });
    assert.equal(res.status, 400);
    assert.equal(res.json.data.code, "invalid_request_deviceId");
  });

  test("a wrong code is 400 invalid_request_code; the 6th failure for one user is 429", async () => {
    const session = userWithSession(104);
    for (let i = 0; i < 5; i++) {
      const res = await call("POST", "/device/claim", { body: { code: "000000" }, session });
      assert.equal(res.status, 400);
      assert.equal(res.json.data.code, "invalid_request_code");
    }
    assert.equal((await call("POST", "/device/claim", { body: { code: "000000" }, session })).status, 429);
  });

  test("the 11th failed claim from one IP is 429 even across users", async () => {
    const ip = "10.8.8.8";
    for (let i = 0; i < 10; i++) {
      const session = userWithSession(200 + i);
      assert.equal((await call("POST", "/device/claim", { body: { code: "000000" }, session, ip })).status, 400);
    }
    const session = userWithSession(299);
    assert.equal((await call("POST", "/device/claim", { body: { code: "000000" }, session, ip })).status, 429);
  });
});
