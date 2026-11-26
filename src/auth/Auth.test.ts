import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { RequestHandler } from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { IS_DEV } from "../config/env.js";
import tokenFilterDb from "../config/db/mysql.js";
import { MailerUtilities, MailOptions } from "../utils/MailerUtilities.js";
import { RequestLogSearch } from "../utils/logging/RequestLogSearch.js";
import { TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { Time } from "../constants/Time.js";
import { signToken, verifyToken } from "../token/Token.service.js";
import createAuthController from "./Auth.controller.js";
import {
  AuthRegistrationService,
  DEV_OTP_BYPASS_CODE,
  MAX_VERIFY_ATTEMPTS,
  OTP_TTL_MS,
  generateOtp,
  isStaleUnverified,
} from "./AuthRegistration.service.js";
import { AuthSessionService, BCRYPT_SALT_ROUNDS } from "./AuthSession.service.js";
import { toAdminUserDto } from "./AuthAdmin.service.js";
import { passwordChangedMail, verificationCodeMail } from "./Auth.emailTemplate.js";
import { PermissionService, ResourceType, isValidRole, parseRoles } from "./Permission.js";
import { PPHS_ROLES, stripRoles } from "../migrations/20261126000300_strip_pphs_roles.js";
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_BYTES,
  SYSTEM_MAX_LENGTH,
  isStrongPassword,
  parseRecentLogsLimit,
  validateEmailBody,
  validateLoginBody,
  validatePasswordUpdateBody,
  validatePasswordValidateBody,
  validateRegisterBody,
  validateRequestIdParam,
  validateTelegramChatIdParam,
  validateTelegramLogToggleBody,
  validateTelegramModuleKeyParam,
  validateUserIdParam,
  validateUserRolesBody,
  validateUsername,
  validateVerifyEmailBody,
} from "./Auth.validator.js";

// In-process HTTP checks for /auth: the real controller, limiters and MandatoryTokenFilter
// on a throwaway server, with an in-memory fake DB and stubbed mail / log search / Telegram.
// Nothing leaves the machine.

type Row = Record<string, any>;

const USER_TABLE = "tb_aa_user";
const PASSWORD = "Str0ng!pass";
const SYSTEM = "fnd";
const OWNER_ROLE = "SYSTEM_R5";

/** Minimal KnexSqlUtilities stand-in: equality WHERE, honours `columns`, keeps every write. */
function fakeDb() {
  const tables: Record<string, Row[]> = { [USER_TABLE]: [] };
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const project = (row: Row, columns?: readonly string[]) =>
    !columns || columns.includes("*") ? { ...row } : Object.fromEntries(columns.map((c) => [c, row[c]]));
  let nextId = 1;
  const db = {
    async find(table: string, where: Row = {}, options: { limit?: number; columns?: readonly string[] } = {}) {
      const rows = (tables[table] ?? []).filter((r) => matches(r, where)).map((r) => project(r, options.columns));
      return options.limit ? rows.slice(0, options.limit) : rows;
    },
    async findOne(table: string, where: Row = {}, columns: readonly string[] = ["*"]) {
      const row = (tables[table] ?? []).find((r) => matches(r, where));
      return row ? project(row, columns) : undefined;
    },
    async update(table: string, where: Row, data: Row) {
      const rows = (tables[table] ?? []).filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return rows;
    },
    async insert(table: string, data: Row) {
      const row = { id: nextId++, ...data };
      (tables[table] ??= []).push(row);
      return row;
    },
  };
  return { db, tables };
}

const { db, tables } = fakeDb();
const users = () => tables[USER_TABLE];
const activeUser = (email: string) => users().find((u) => u.email === email && u.record_status === "A");

async function seedUser(over: Row = {}): Promise<Row> {
  const username = over.username ?? `user${users().length + 1}`;
  const row = {
    username,
    email: `${username}@example.com`,
    email_verified: 1,
    verify_code: null,
    verify_code_expires_at: null,
    verify_attempts: 0,
    password: await bcrypt.hash(PASSWORD, 4),
    system: SYSTEM,
    roles: "[]",
    username_system: `${username}_${SYSTEM}`,
    state: "ACTIVE",
    last_logged_in_dt: 0,
    created_dt: 0,
    created_by: "SYSTEM",
    record_status: "A",
    ...over,
  };
  return db.insert(USER_TABLE, row);
}

/** Signs a session for `user` and stores it as the user's current token (what login does). */
function sessionFor(user: Row): string {
  const token = signToken({
    id: user.id,
    username: user.username,
    system: user.system,
    roles: [],
    lastLoggedInDt: 0,
  });
  user.token = token;
  return token;
}

const sentMail: MailOptions[] = [];
let failMail = false;

let server: Server;
let base: string;
let ipCounter = 0;
const previousSecret = process.env.JWT_SECRET;

before(async () => {
  process.env.JWT_SECRET = "test-secret";
  mock.method(MailerUtilities, "sendMail", async (options: MailOptions) => {
    if (failMail) throw new Error("smtp down");
    sentMail.push(options);
  });
  // MandatoryTokenFilter's revocation lookup reads the same fake user table.
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
  app.use("/auth", createAuthController(db as never));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
});

after(async () => {
  mock.restoreAll();
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  sentMail.length = 0;
  failMail = false;
});

interface Res {
  status: number;
  json: any;
  cookies: string[];
}

/** Each request gets its own X-Real-IP so the per-IP auth limiters never interfere. */
async function call(method: "GET" | "POST", path: string, body?: unknown, token?: string, csrf = true): Promise<Res> {
  const headers: Record<string, string> = { "X-Real-IP": `10.0.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}` };
  if (method === "POST") headers["Content-Type"] = "application/json";
  if (token) {
    headers.Cookie = `jwt_token=${token}; csrf_token=csrf123`;
    if (csrf) headers["X-CSRF-Token"] = "csrf123";
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), cookies: res.headers.getSetCookie() };
}
const post = (path: string, body?: unknown, token?: string, csrf?: boolean) => call("POST", path, body, token, csrf);
const get = (path: string, token?: string) => call("GET", path, undefined, token);

const cookieValue = (cookies: string[], name: string) =>
  cookies
    .find((c) => c.startsWith(`${name}=`))
    ?.split(";")[0]
    .slice(name.length + 1);

/** The 6-digit code from the last verification email's subject. */
const mailedCode = () => sentMail.at(-1)!.subject.slice(0, 6);

// ── register → verify → session ────────────────────────────────────────────

describe("POST /auth/register", () => {
  test("creates an unverified row (bcrypt 10, SHA-256 OTP, 15 min) and emails the code", async () => {
    const before = Date.now();
    const res = await post("/register", {
      username: "  newbie  ",
      email: " NewBie@Example.com ".trim(),
      password: PASSWORD,
      system: SYSTEM,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data, { requiresVerification: true, email: "newbie@example.com" });
    assert.equal(cookieValue(res.cookies, "jwt_token"), undefined);

    const row = activeUser("newbie@example.com")!;
    assert.equal(row.username, "newbie");
    assert.equal(row.username_system, "newbie_fnd");
    assert.equal(row.email_verified, 0);
    assert.equal(row.verify_attempts, 0);
    assert.equal(row.roles, "[]");
    assert.equal(row.state, "REGISTER");
    assert.equal(row.created_by, "SYSTEM");
    assert.match(row.password, /^\$2[aby]\$10\$/);
    assert.ok(await bcrypt.compare(PASSWORD, row.password));
    assert.ok(row.verify_code_expires_at >= before + 15 * Time.MINUTE_MS);
    assert.ok(row.verify_code_expires_at <= Date.now() + 15 * Time.MINUTE_MS);

    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, "newbie@example.com");
    const code = mailedCode();
    assert.match(code, /^\d{6}$/);
    assert.equal(sentMail[0].subject, `${code} is your verification code`);
    assert.equal(row.verify_code, sha256Hex(code));
    assert.match(sentMail[0].html!, /15 minutes/);
  });

  test("HTML-escapes the username in the email", async () => {
    const res = await post("/register", {
      username: "<b>x</b>",
      email: "xss@example.com",
      password: PASSWORD,
      system: SYSTEM,
    });
    assert.equal(res.status, 200);
    assert.ok(sentMail[0].html!.includes("&lt;b&gt;x&lt;/b&gt;"));
    assert.ok(!sentMail[0].html!.includes("<b>x</b>"));
  });

  test("rejects bad bodies with the codes fndom maps", async () => {
    const ok = { username: "valid", email: "valid@example.com", password: PASSWORD, system: SYSTEM };
    for (const [body, status, code] of [
      [{ ...ok, system: "other" }, 400, "invalid_request_system"],
      [{ ...ok, password: "weakpass" }, 400, "weak_password"],
      [{ ...ok, username: "ab" }, 400, "invalid_request_username"],
      [{ ...ok, username: "x".repeat(65) }, 400, "invalid_request_username"],
      [{ ...ok, email: "nope" }, 400, "invalid_request_email"],
      // A7: column-width caps (an oversized email used to reach the insert and answer 500 registration_failed)
      [{ ...ok, email: `${"a".repeat(EMAIL_MAX_LENGTH)}@example.com` }, 400, "invalid_request_email"],
      [{ ...ok, system: "f".repeat(SYSTEM_MAX_LENGTH + 1) }, 400, "invalid_request_system"],
      // A7: bcrypt only hashes 72 bytes; a too-long new password is a weak one
      [{ ...ok, password: `Aa1!${"a".repeat(PASSWORD_MAX_BYTES - 3)}` }, 400, "weak_password"],
      [{ ...ok, password: `Aa1!${"é".repeat(35)}` }, 400, "weak_password"], // 39 chars, 74 bytes
    ] as const) {
      const res = await post("/register", body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.json.data.code, code);
    }
    assert.equal(sentMail.length, 0);
  });

  test("email or username held by a verified (or fresh unverified) row → 409", async () => {
    await seedUser({ username: "taken", email: "taken@example.com" });
    await seedUser({
      username: "pending",
      email: "pending@example.com",
      email_verified: 0,
      verify_code_expires_at: Date.now() + Time.MINUTE_MS,
    });
    const base = { password: PASSWORD, system: SYSTEM };
    for (const [body, code] of [
      [{ ...base, username: "fresh1", email: "taken@example.com" }, "email_already_registered"],
      [{ ...base, username: "fresh2", email: "pending@example.com" }, "email_already_registered"],
      [{ ...base, username: "taken", email: "fresh3@example.com" }, "username_already_taken"],
      [{ ...base, username: "pending", email: "fresh4@example.com" }, "username_already_taken"],
    ] as const) {
      const res = await post("/register", body);
      assert.equal(res.status, 409);
      assert.equal(res.json.data.code, code);
    }
  });

  test("lapsed unverified rows holding the email or username are soft-deleted", async () => {
    const lapsed = Date.now() - 1;
    const byEmail = await seedUser({
      username: "squat1",
      email: "victim@example.com",
      email_verified: 0,
      verify_code_expires_at: lapsed,
    });
    const byName = await seedUser({
      username: "victim",
      email: "squat2@example.com",
      email_verified: 0,
      verify_code_expires_at: null,
    });
    const res = await post("/register", {
      username: "victim",
      email: "victim@example.com",
      password: PASSWORD,
      system: SYSTEM,
    });
    assert.equal(res.status, 200);
    assert.equal(byEmail.record_status, "D");
    assert.equal(byName.record_status, "D");
    assert.equal(activeUser("victim@example.com")!.username, "victim");
  });

  test("mail failure → 500 registration_failed", async () => {
    failMail = true;
    const res = await post("/register", {
      username: "mailfail",
      email: "mailfail@example.com",
      password: PASSWORD,
      system: SYSTEM,
    });
    assert.equal(res.status, 500);
    assert.equal(res.json.data.code, "registration_failed");
  });
});

describe("POST /auth/preflight", () => {
  test("verified or fresh unverified → login; lapsed unverified or unknown → register", async () => {
    await seedUser({ username: "pfa", email: "pf-verified@example.com" });
    await seedUser({
      username: "pfb",
      email: "pf-fresh@example.com",
      email_verified: 0,
      verify_code_expires_at: Date.now() + Time.MINUTE_MS,
    });
    await seedUser({
      username: "pfc",
      email: "pf-lapsed@example.com",
      email_verified: 0,
      verify_code_expires_at: Date.now() - 1,
    });
    const login = { exist: true, nextStep: "login" };
    const register = { exist: false, nextStep: "register" };
    for (const [email, expected] of [
      ["PF-Verified@example.com", login],
      ["pf-fresh@example.com", login],
      ["pf-lapsed@example.com", register],
      ["nobody@example.com", register],
    ] as const) {
      const res = await post("/preflight", { email, system: SYSTEM });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.data, expected, email);
    }
    assert.equal((await post("/preflight", { email: "bad", system: SYSTEM })).json.data.code, "invalid_request_email");
  });
});

describe("POST /auth/preflight limiter (A9)", () => {
  test("30 per IP per 15 min, then 429 with the limiter body; other IPs unaffected", async () => {
    const preflight = (ip: string) =>
      fetch(`${base}/preflight`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Real-IP": ip },
        body: JSON.stringify({ email: "nobody@example.com", system: SYSTEM }),
      });
    const first = await preflight("203.0.113.9");
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("ratelimit-policy"), "30;w=900");
    for (let i = 1; i < 30; i++) assert.equal((await preflight("203.0.113.9")).status, 200);
    const limited = await preflight("203.0.113.9");
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), {
      success: false,
      message: "Too many requests. Please try again in 15 minutes.",
    });
    assert.equal((await preflight("203.0.113.10")).status, 200);
  });
});

describe("POST /auth/verify-email", () => {
  async function pendingUser(username: string, over: Row = {}) {
    const code = "424242";
    const user = await seedUser({
      username,
      email_verified: 0,
      verify_code: sha256Hex(code),
      verify_code_expires_at: Date.now() + 10 * Time.MINUTE_MS,
      state: "REGISTER",
      roles: JSON.stringify(["TRAVEL_R1"]),
      ...over,
    });
    return { user, code };
  }
  const verify = (user: Row, code: string, password = PASSWORD) =>
    post("/verify-email", { email: user.email, system: SYSTEM, code, password });

  test("right code + password → session cookies only, never the token in the body", async () => {
    const { user, code } = await pendingUser("verifyok");
    const res = await verify(user, code);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data, { username: "verifyok", roles: ["TRAVEL_R1"] });
    const jwt = cookieValue(res.cookies, "jwt_token")!;
    assert.ok(jwt);
    assert.ok(res.cookies.find((c) => c.startsWith("jwt_token="))!.includes("HttpOnly"));
    assert.ok(cookieValue(res.cookies, "csrf_token"));
    assert.ok(!res.cookies.find((c) => c.startsWith("csrf_token="))!.includes("HttpOnly"));
    assert.ok(!JSON.stringify(res.json).includes(jwt));
    assert.equal(user.email_verified, 1);
    assert.equal(user.verify_code, null);
    assert.equal(user.verify_code_expires_at, null);
    assert.equal(user.state, "ACTIVE");
    assert.equal(user.token, jwt);
    assert.equal(verifyToken(jwt).username, "verifyok");
  });

  test("wrong password or wrong code → 401 and one attempt each", async () => {
    const { user, code } = await pendingUser("verifywrong");
    const badPw = await verify(user, code, "Wr0ng!pass");
    assert.equal(badPw.status, 401);
    assert.equal(badPw.json.data.code, "invalid_login_credentials");
    assert.equal(user.verify_attempts, 1);
    const badCode = await verify(user, "000000");
    assert.equal(badCode.status, 401);
    assert.equal(badCode.json.data.code, "invalid_login_credentials");
    assert.equal(user.verify_attempts, 2);
    assert.equal(user.email_verified, 0);
    assert.equal(user.token, undefined);
  });

  test("5 attempts used → 429 max_verify_attempts even with the right code", async () => {
    const { user, code } = await pendingUser("verifymax", { verify_attempts: 5 });
    const res = await verify(user, code);
    assert.equal(res.status, 429);
    assert.equal(res.json.data.code, "max_verify_attempts");
    assert.equal(user.email_verified, 0);
  });

  test("the 5th wrong attempt still answers 401; the 6th is 429", async () => {
    const { user, code } = await pendingUser("verifyfive", { verify_attempts: 4 });
    assert.equal((await verify(user, "000000")).status, 401);
    assert.equal(user.verify_attempts, 5);
    assert.equal((await verify(user, code)).status, 429);
  });

  test("expired code → 400 code_expired", async () => {
    const { user, code } = await pendingUser("verifyexp", { verify_code_expires_at: Date.now() - 1 });
    const res = await verify(user, code);
    assert.equal(res.status, 400);
    assert.equal(res.json.data.code, "code_expired");
  });

  test("already verified → 409 (no session from this endpoint); unknown email → 401", async () => {
    const verified = await seedUser({ username: "verifydone" });
    const res = await verify(verified, "123456");
    assert.equal(res.status, 409);
    assert.equal(res.json.data.code, "email_already_registered");
    assert.equal(cookieValue(res.cookies, "jwt_token"), undefined);
    const unknown = await post("/verify-email", {
      email: "ghost@example.com",
      system: SYSTEM,
      code: "123456",
      password: PASSWORD,
    });
    assert.equal(unknown.status, 401);
  });

  test("dev bypass code 111111 is rejected outside dev", { skip: IS_DEV }, async () => {
    const { user } = await pendingUser("verifydev");
    const res = await verify(user, "111111");
    assert.equal(res.status, 401);
    assert.equal(res.json.data.code, "invalid_login_credentials");
    assert.equal(user.email_verified, 0);
  });

  test("body validation: code must be 6 digits, password required", async () => {
    const { user } = await pendingUser("verifybody");
    assert.equal((await verify(user, "12345")).json.data.code, "invalid_request_code");
    const noPw = await post("/verify-email", { email: user.email, system: SYSTEM, code: "123456" });
    assert.equal(noPw.status, 400);
    assert.equal(noPw.json.data.code, "invalid_request_password");
  });
});

describe("POST /auth/resend-verify", () => {
  test("always 200 { sent: true }; only an unverified account gets a new code", async () => {
    const pending = await seedUser({
      username: "resendme",
      email_verified: 0,
      verify_code: "old",
      verify_code_expires_at: 1,
      verify_attempts: 4,
    });
    await seedUser({ username: "resendverified" });

    const res = await post("/resend-verify", { email: pending.email, system: SYSTEM });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data, { sent: true });
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, pending.email);
    assert.equal(pending.verify_code, sha256Hex(mailedCode()));
    assert.equal(pending.verify_attempts, 0);
    assert.ok(pending.verify_code_expires_at > Date.now() + 14 * Time.MINUTE_MS);

    for (const body of [
      { email: "resendverified@example.com", system: SYSTEM },
      { email: "ghost@example.com", system: SYSTEM },
      { email: "not-an-email", system: SYSTEM },
    ]) {
      sentMail.length = 0;
      const r = await post("/resend-verify", body);
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.data, { sent: true });
      assert.equal(sentMail.length, 0);
    }

    failMail = true;
    const failed = await post("/resend-verify", { email: pending.email, system: SYSTEM });
    assert.equal(failed.status, 200);
    assert.deepEqual(failed.json.data, { sent: true });
  });
});

describe("POST /auth/login", () => {
  test("right password → cookies + { username, roles } from the DB row", async () => {
    const user = await seedUser({ username: "loginok", roles: JSON.stringify([OWNER_ROLE]) });
    const res = await post("/login", { email: "LoginOk@example.com", password: PASSWORD, system: SYSTEM });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data, { username: "loginok", roles: [OWNER_ROLE] });
    const jwt = cookieValue(res.cookies, "jwt_token")!;
    assert.equal(user.token, jwt);
    assert.ok(!JSON.stringify(res.json).includes(jwt));
    assert.ok(user.last_logged_in_dt > 0);
  });

  test("the session token is written to the active row by id, never to a soft-deleted twin (A4)", async () => {
    // Same username_system as the live account, but soft-deleted (e.g. a lapsed unverified row).
    const twin = await seedUser({ username: "twin", email: "twin-old@example.com", record_status: "D" });
    const live = await seedUser({ username: "twin" });
    const res = await post("/login", { email: "twin@example.com", password: PASSWORD, system: SYSTEM });
    assert.equal(res.status, 200);
    assert.equal(live.token, cookieValue(res.cookies, "jwt_token"));
    assert.equal(twin.token, undefined);
    assert.equal(twin.last_logged_in_dt, 0);
  });

  test("unparseable roles → []", async () => {
    await seedUser({ username: "loginroles", roles: "not json" });
    const res = await post("/login", { email: "loginroles@example.com", password: PASSWORD, system: SYSTEM });
    assert.deepEqual(res.json.data.roles, []);
  });

  test("wrong password / unknown → 401; unverified → 403 email_not_verified", async () => {
    await seedUser({ username: "loginunv", email_verified: 0 });
    const wrong = await post("/login", { email: "loginok@example.com", password: "Wr0ng!pass", system: SYSTEM });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.json.data.code, "invalid_login_credentials");
    const ghost = await post("/login", { email: "ghost@example.com", password: PASSWORD, system: SYSTEM });
    assert.equal(ghost.status, 401);
    const unv = await post("/login", { email: "loginunv@example.com", password: PASSWORD, system: SYSTEM });
    assert.equal(unv.status, 403);
    assert.equal(unv.json.data.code, "email_not_verified");
    assert.equal(cookieValue(unv.cookies, "jwt_token"), undefined);
  });

  test("a password over 72 bytes → 400 invalid_request_password, before any lookup (A7)", async () => {
    const res = await post("/login", { email: "loginok@example.com", password: "x".repeat(73), system: SYSTEM });
    assert.equal(res.status, 400);
    assert.equal(res.json.data.code, "invalid_request_password");
  });

  test("the unverified-login PM2 line masks the email (A8)", async (t) => {
    await seedUser({ username: "maskme", email_verified: 0 });
    const lines: string[] = [];
    t.mock.method(console, "warn", (line: string) => lines.push(line));
    assert.equal(
      (await post("/login", { email: "maskme@example.com", password: PASSWORD, system: SYSTEM })).status,
      403,
    );
    const line = lines.find((l) => l.includes("Unverified login attempt"));
    assert.ok(line?.includes("m***@example.com"), line);
    assert.ok(!line?.includes("maskme@"), line);
  });
});

// ── session routes ─────────────────────────────────────────────────────────

describe("POST /auth/verification and /auth/logout", () => {
  test("verification needs the cookie and CSRF; roles come from the DB row", async () => {
    const user = await seedUser({ username: "sess", roles: JSON.stringify(["TRAVEL_R5"]) });
    const token = sessionFor(user);
    const anonymous = await post("/verification");
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.json.status, "token_invalid");
    const noCsrf = await post("/verification", {}, token, false);
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.json.status, "csrf_invalid");
    const ok = await post("/verification", {}, token);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.data, { username: "sess", roles: ["TRAVEL_R5"], exist: true });
  });

  test("logout clears both cookies and revokes the stored token", async () => {
    const user = await seedUser({ username: "bye" });
    const token = sessionFor(user);
    const res = await post("/logout", {}, token, false);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data, { loggedOut: true });
    for (const name of ["jwt_token", "csrf_token"]) {
      const cleared = res.cookies.find((c) => c.startsWith(`${name}=;`));
      assert.ok(cleared && /Expires=Thu, 01 Jan 1970/.test(cleared), name);
    }
    assert.equal(user.token, "");
    assert.equal((await post("/verification", {}, token)).status, 401);
  });

  test("logout without a cookie or with a forged one still answers 200 and clears cookies", async () => {
    for (const token of [undefined, "garbage.token.value"]) {
      const res = await post("/logout", {}, token, false);
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.data, { loggedOut: true });
      assert.ok(res.cookies.some((c) => c.startsWith("jwt_token=;")));
    }
  });
});

describe("POST /auth/password/*", () => {
  test("validate → { isValid } for the session's user; needs a session", async () => {
    const user = await seedUser({ username: "pwcheck" });
    const token = sessionFor(user);
    assert.deepEqual((await post("/password/validate", { password: PASSWORD }, token)).json.data, { isValid: true });
    assert.deepEqual((await post("/password/validate", { password: "nope" }, token)).json.data, { isValid: false });
    assert.equal((await post("/password/validate", { password: PASSWORD })).status, 401);
    assert.equal((await post("/password/validate", {}, token)).json.data.code, "invalid_request_password");
  });

  test("update: needs the current password and a strong new one; rotates the session", async () => {
    // A non-zero last login makes the re-issued JWT differ from the seeded one even within the same second.
    const user = await seedUser({ username: "pwchange", last_logged_in_dt: 123 });
    const token = sessionFor(user);
    const wrong = await post("/password/update", { currentPassword: "Wr0ng!pass", newPassword: "N3w!passwd" }, token);
    assert.equal(wrong.status, 401);
    assert.equal(wrong.json.data.code, "invalid_login_credentials");
    const weak = await post("/password/update", { currentPassword: PASSWORD, newPassword: "short" }, token);
    assert.equal(weak.status, 400);
    assert.equal(weak.json.data.code, "weak_password");
    assert.equal(user.token, token);

    const ok = await post("/password/update", { currentPassword: PASSWORD, newPassword: "N3w!passwd" }, token);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.data, { updated: true });
    const rotated = cookieValue(ok.cookies, "jwt_token")!;
    assert.ok(rotated && rotated !== token);
    assert.equal(user.token, rotated);
    assert.ok(await bcrypt.compare("N3w!passwd", user.password));
    assert.match(user.password, /^\$2[aby]\$10\$/);
    assert.equal((await post("/verification", {}, token)).status, 401);
    assert.equal((await post("/verification", {}, rotated)).status, 200);

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, user.email);
    assert.equal(sentMail[0].subject, "Your Awense password has been changed");
  });

  test("validate / update reject a password over 72 bytes with the field's invalid_request code (A7)", async () => {
    const token = sessionFor(await seedUser({ username: "pwlong" }));
    const long = "x".repeat(PASSWORD_MAX_BYTES + 1);
    assert.equal(
      (await post("/password/validate", { password: long }, token)).json.data.code,
      "invalid_request_password",
    );
    const current = await post("/password/update", { currentPassword: long, newPassword: "N3w!passwd" }, token);
    assert.equal(current.json.data.code, "invalid_request_currentPassword");
    const next = await post("/password/update", { currentPassword: PASSWORD, newPassword: `Aa1!${long}` }, token);
    assert.equal(next.json.data.code, "weak_password");
  });

  test("passwordCheckLimiter: 10 wrong passwords per user per 15 min, shared by validate and update (A1)", async () => {
    const user = await seedUser({ username: "pwbrute" });
    const token = sessionFor(user);
    // Successes never count.
    for (let i = 0; i < 12; i++) {
      assert.deepEqual((await post("/password/validate", { password: PASSWORD }, token)).json.data, { isValid: true });
    }
    // A wrong password answers 200 { isValid: false } but counts; so does update's 401.
    for (let i = 0; i < 9; i++) {
      const res = await post("/password/validate", { password: "Wr0ng!pass" }, token);
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.data, { isValid: false });
    }
    const wrongCurrent = await post(
      "/password/update",
      { currentPassword: "Wr0ng!pass", newPassword: "N3w!passwd" },
      token,
    );
    assert.equal(wrongCurrent.status, 401);
    // The 11th attempt is refused on both routes, even with the right password (each call has its own IP).
    for (const [path, body] of [
      ["/password/validate", { password: PASSWORD }],
      ["/password/update", { currentPassword: PASSWORD, newPassword: "N3w!passwd" }],
    ] as const) {
      const limited = await post(path, body, token);
      assert.equal(limited.status, 429, path);
      assert.deepEqual(limited.json, {
        success: false,
        message: "Too many password attempts. Please try again in 15 minutes.",
      });
    }
    assert.ok(await bcrypt.compare(PASSWORD, user.password));
    // Another user's bucket is untouched.
    const other = sessionFor(await seedUser({ username: "pwbystander" }));
    assert.equal((await post("/password/validate", { password: PASSWORD }, other)).status, 200);
  });

  test("the password-changed email has no formatted time (A6)", async () => {
    const user = await seedUser({ username: "pwnotime" });
    const ok = await post(
      "/password/update",
      { currentPassword: PASSWORD, newPassword: "N3w!passwd" },
      sessionFor(user),
    );
    assert.equal(ok.status, 200);
    await new Promise((resolve) => setImmediate(resolve));
    const html = sentMail.at(-1)!.html!;
    assert.ok(html.includes("<p>Your password was successfully changed.</p>"));
    assert.doesNotMatch(html, /\d{1,2}:\d{2}|\b20\d{2}\b/);
  });

  test("update still succeeds when the notification email fails", async () => {
    const user = await seedUser({ username: "pwmailfail" });
    failMail = true;
    const ok = await post(
      "/password/update",
      { currentPassword: PASSWORD, newPassword: "N3w!passwd" },
      sessionFor(user),
    );
    assert.equal(ok.status, 200);
  });
});

// ── admin ──────────────────────────────────────────────────────────────────

describe("/auth/admin (OWNER only)", () => {
  let ownerToken: string;
  let plainToken: string;
  let jwtOnlyOwnerToken: string;

  before(async () => {
    ownerToken = sessionFor(await seedUser({ username: "boss", roles: JSON.stringify([OWNER_ROLE]) }));
    plainToken = sessionFor(await seedUser({ username: "pleb", roles: JSON.stringify(["TRAVEL_R5"]) }));
    // JWT claims OWNER but the DB row has no roles: the DB wins.
    const demoted = await seedUser({ username: "demoted", roles: "[]" });
    jwtOnlyOwnerToken = signToken({
      id: demoted.id,
      username: "demoted",
      system: SYSTEM,
      roles: [OWNER_ROLE],
      lastLoggedInDt: 0,
    });
    demoted.token = jwtOnlyOwnerToken;
  });

  const routes: ["GET" | "POST", string, unknown?][] = [
    ["GET", "/admin/users"],
    ["POST", "/admin/users/1/roles", { roles: [] }],
    ["GET", "/admin/recent-request-logs?limit=3"],
    ["GET", "/admin/request-logs/req_0123456789ab"],
    ["GET", "/admin/telegram-log-subscriptions"],
    ["POST", "/admin/telegram-log-subscriptions/5/auth", { enabled: true }],
  ];

  test("no cookie → 401; non-owner (incl. JWT-only owner) → 403", async () => {
    for (const [method, path, body] of routes) {
      assert.equal((await call(method, path, body)).status, 401, path);
      for (const token of [plainToken, jwtOnlyOwnerToken]) {
        const res = await call(method, path, body, token);
        assert.equal(res.status, 403, path);
        assert.equal(res.json.data.code, "forbidden_access", path);
      }
    }
  });

  test("GET /admin/users → camelCase users, never passwords or tokens", async () => {
    const res = await get("/admin/users", ownerToken);
    assert.equal(res.status, 200);
    const boss = res.json.data.find((u: Row) => u.username === "boss");
    assert.deepEqual(Object.keys(boss).sort(), [
      "createdDt",
      "email",
      "id",
      "lastLoggedInDt",
      "roles",
      "state",
      "system",
      "username",
    ]);
    assert.deepEqual(boss.roles, [OWNER_ROLE]);
    assert.ok(!JSON.stringify(res.json).includes("$2"));
    assert.ok(!JSON.stringify(res.json).includes(ownerToken));
  });

  test("POST /admin/users/:id/roles validates id and roles, then stores JSON", async () => {
    const target = await seedUser({ username: "promoteme" });
    for (const id of ["abc", "0", "1.5"]) {
      const res = await post(`/admin/users/${id}/roles`, { roles: [] }, ownerToken);
      assert.equal(res.status, 400, id);
      assert.equal(res.json.data.code, "invalid_request_id", id);
    }
    const badRole = await post(`/admin/users/${target.id}/roles`, { roles: ["SYSTEM_r5"] }, ownerToken);
    assert.equal(badRole.status, 400);
    assert.equal(badRole.json.data.code, "invalid_request_roles");
    assert.equal((await post(`/admin/users/${target.id}/roles`, { roles: "admin" }, ownerToken)).status, 400);
    const ok = await post(`/admin/users/${target.id}/roles`, { roles: ["TRAVEL_R4", "admin"] }, ownerToken);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.data, { updated: true });
    assert.equal(target.roles, JSON.stringify(["TRAVEL_R4", "admin"]));
  });

  test("POST /admin/users/:id/roles: an OWNER can't drop their own SYSTEM_R5 (A3), others' roles unchanged", async () => {
    const boss = activeUser("boss@example.com")!;
    for (const roles of [[], ["TRAVEL_R5"]]) {
      const res = await post(`/admin/users/${boss.id}/roles`, { roles }, ownerToken);
      assert.equal(res.status, 403);
      assert.equal(res.json.data.code, "forbidden_access");
      assert.equal(res.json.data.message, "You can't remove your own owner role");
    }
    assert.equal(boss.roles, JSON.stringify([OWNER_ROLE]));
    // Keeping SYSTEM_R5 while changing the rest is fine.
    const keep = await post(`/admin/users/${boss.id}/roles`, { roles: [OWNER_ROLE, "TRAVEL_R5"] }, ownerToken);
    assert.equal(keep.status, 200);
    assert.equal(boss.roles, JSON.stringify([OWNER_ROLE, "TRAVEL_R5"]));
    // Another owner can still be demoted.
    const otherOwner = await seedUser({ username: "boss2", roles: JSON.stringify([OWNER_ROLE]) });
    assert.equal((await post(`/admin/users/${otherOwner.id}/roles`, { roles: [] }, ownerToken)).status, 200);
    assert.equal(otherOwner.roles, "[]");
  });

  test("POST /admin/users/:id/roles on a soft-deleted or unknown user → 404, nothing written (A3)", async () => {
    const deleted = await seedUser({ username: "deletedrole", record_status: "D" });
    for (const id of [deleted.id, 999_999]) {
      const res = await post(`/admin/users/${id}/roles`, { roles: ["TRAVEL_R4"] }, ownerToken);
      assert.equal(res.status, 404, String(id));
      assert.equal(res.json.data.code, "entity_not_found");
      assert.equal(res.json.data.message, "User not found");
    }
    assert.equal(deleted.roles, "[]");
  });

  test("GET /admin/recent-request-logs clamps limit to 1..20 (default 3) and trims fields", async (t) => {
    const limits: number[] = [];
    t.mock.method(RequestLogSearch, "recent", (limit: number) => {
      limits.push(limit);
      return [
        {
          raw: "secret raw",
          entry: null,
          requestId: "req_0123456789ab",
          timestamp: "t",
          method: "GET",
          path: "/x",
          statusCode: 200,
        },
      ];
    });
    for (const q of ["", "?limit=abc", "?limit=0", "?limit=-5", "?limit=7", "?limit=500"]) {
      const res = await get(`/admin/recent-request-logs${q}`, ownerToken);
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.data, [
        { requestId: "req_0123456789ab", timestamp: "t", method: "GET", path: "/x", statusCode: 200 },
      ]);
    }
    assert.deepEqual(limits, [3, 3, 3, 1, 7, 20]);
  });

  test("GET /admin/request-logs/:requestId: format → 400, no match → 404, match → 200", async (t) => {
    const searched: string[] = [];
    t.mock.method(RequestLogSearch, "find", (id: string) => {
      searched.push(id);
      return id === "req_abcde" ? [{ raw: "r", requestId: id }] : [];
    });
    for (const id of ["req_123", "abc_0123456789ab", "req_0123456789abc", "req_0123456789xz"]) {
      const res = await get(`/admin/request-logs/${id}`, ownerToken);
      assert.equal(res.status, 400, id);
      assert.equal(res.json.data.code, "invalid_request_requestId", id);
    }
    const missing = await get("/admin/request-logs/req_0123456789AB", ownerToken);
    assert.equal(missing.status, 404);
    assert.equal(missing.json.data.code, "entity_not_found");
    const ok = await get("/admin/request-logs/req_abcde", ownerToken);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.data, [{ raw: "r", requestId: "req_abcde" }]);
    assert.deepEqual(searched, ["req_0123456789AB", "req_abcde"]);
  });

  test("telegram log subscriptions: list, and toggle with module / chat / enabled checks", async (t) => {
    const matrix = { modules: [{ key: "auth", label: "Auth" }], chats: [] };
    const toggles: unknown[][] = [];
    t.mock.method(TelegramLogSubscriptionService.prototype, "listMatrix", async () => matrix);
    t.mock.method(TelegramLogSubscriptionService.prototype, "setEnabled", async (...args: unknown[]) => {
      toggles.push(args);
    });
    const list = await get("/admin/telegram-log-subscriptions", ownerToken);
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.data, matrix);

    for (const [path, code] of [
      ["5/nope", "invalid_request_moduleKey"],
      ["x/auth", "invalid_request_chatId"],
      ["-1/auth", "invalid_request_chatId"],
    ]) {
      const res = await post(`/admin/telegram-log-subscriptions/${path}`, { enabled: true }, ownerToken);
      assert.equal(res.status, 400, path);
      assert.equal(res.json.data.code, code, path);
    }
    const notBool = await post("/admin/telegram-log-subscriptions/5/auth", { enabled: "yes" }, ownerToken);
    assert.equal(notBool.status, 400);
    assert.equal(notBool.json.data.code, "invalid_request_enabled");
    assert.equal(toggles.length, 0);

    const ok = await post("/admin/telegram-log-subscriptions/5/auth", { enabled: false }, ownerToken);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.data, matrix);
    assert.deepEqual(
      toggles.map((args) => args.slice(0, 3)),
      [[5, "auth", false]],
    );
  });
});

// ── Units: validators, helpers, mappers, mail builders, services with injected fakes ──

describe("Auth validators", () => {
  test("register body: trims username, lowercases email, keeps password as sent", () => {
    assert.deepEqual(
      validateRegisterBody({ username: " bob ", email: "Bob@Example.com", password: PASSWORD, system: "fnd" }),
      { username: "bob", email: "bob@example.com", password: PASSWORD, system: "fnd" },
    );
  });

  test("validateUsername: 3–64 after trimming", () => {
    assert.equal(validateUsername("  abc  ", "username"), "abc");
    assert.equal(validateUsername("x".repeat(64), "username").length, 64);
    for (const bad of ["ab", "  ab  ", "x".repeat(65), 5, undefined]) {
      assert.throws(() => validateUsername(bad, "newUsername"), { code: /^invalid_request_newUsername$/ });
    }
  });

  test("isStrongPassword needs 8+ chars with lower, upper, digit and symbol", () => {
    assert.equal(isStrongPassword("Aa1!aaaa"), true);
    for (const weak of ["Aa1!aaa", "aa1!aaaa", "AA1!AAAA", "Aa!aaaaa", "Aa1aaaaa"]) {
      assert.equal(isStrongPassword(weak), false, weak);
    }
  });

  test("verify body: code must be exactly 6 digits", () => {
    const base = { email: "a@b.co", system: "fnd", password: "x" };
    assert.equal(validateVerifyEmailBody({ ...base, code: "012345" }).code, "012345");
    for (const code of ["12345", "1234567", "12345a", 123456, undefined]) {
      assert.throws(() => validateVerifyEmailBody({ ...base, code }), { code: "invalid_request_code" });
    }
  });

  test("email bodies reject padded or malformed emails; login keeps field order", () => {
    assert.throws(() => validateEmailBody({ email: " a@b.co", system: "fnd" }), { code: "invalid_request_email" });
    assert.throws(() => validateLoginBody({ email: "a@b.co", system: "fnd" }), { code: "invalid_request_password" });
    assert.throws(() => validateLoginBody({ email: "a@b.co", password: "x" }), { code: "invalid_request_system" });
  });

  test("caps at the tb_aa_user column widths and bcrypt's 72 bytes (A7)", () => {
    assert.equal(EMAIL_MAX_LENGTH, 255);
    assert.equal(SYSTEM_MAX_LENGTH, 256);
    assert.equal(PASSWORD_MAX_BYTES, 72);
    const email255 = `${"a".repeat(EMAIL_MAX_LENGTH - "@b.co".length)}@b.co`;
    assert.equal(validateEmailBody({ email: email255, system: "fnd" }).email, email255);
    assert.throws(() => validateEmailBody({ email: `a${email255}`, system: "fnd" }), { code: "invalid_request_email" });
    assert.equal(validateEmailBody({ email: "a@b.co", system: "s".repeat(SYSTEM_MAX_LENGTH) }).system.length, 256);
    for (const system of ["", "   ", "s".repeat(SYSTEM_MAX_LENGTH + 1)]) {
      assert.throws(() => validateEmailBody({ email: "a@b.co", system }), { code: "invalid_request_system" });
    }
    // Exactly 72 bytes passes; 73 bytes (or 37 two-byte chars) doesn't.
    const login = { email: "a@b.co", system: "fnd" };
    assert.equal(validateLoginBody({ ...login, password: "x".repeat(72) }).password.length, 72);
    for (const password of ["x".repeat(73), "é".repeat(37)]) {
      assert.throws(() => validateLoginBody({ ...login, password }), { code: "invalid_request_password" });
      assert.throws(() => validateVerifyEmailBody({ ...login, code: "012345", password }), {
        code: "invalid_request_password",
      });
      assert.throws(() => validatePasswordValidateBody({ password }), { code: "invalid_request_password" });
      assert.throws(() => validatePasswordUpdateBody({ currentPassword: password, newPassword: PASSWORD }), {
        code: "invalid_request_currentPassword",
      });
      assert.throws(() => validatePasswordUpdateBody({ currentPassword: "x", newPassword: `Aa1!${password}` }), {
        code: "weak_password",
      });
    }
    const strong72 = `Aa1!${"a".repeat(68)}`;
    assert.equal(
      validateRegisterBody({ username: "bob", email: "a@b.co", password: strong72, system: "fnd" }).password,
      strong72,
    );
  });

  test("password update: weak new password → weak_password", () => {
    assert.throws(() => validatePasswordUpdateBody({ currentPassword: "x", newPassword: "short" }), {
      code: "weak_password",
    });
    assert.throws(() => validatePasswordUpdateBody({ newPassword: PASSWORD }), {
      code: "invalid_request_currentPassword",
    });
  });

  test("admin params", () => {
    assert.equal(validateUserIdParam("12"), 12);
    assert.equal(validateTelegramChatIdParam("99"), 99);
    assert.equal(validateTelegramModuleKeyParam("auth"), "auth");
    assert.throws(() => validateTelegramModuleKeyParam("__proto__"), { code: "invalid_request_moduleKey" });
    assert.deepEqual(validateUserRolesBody({ roles: ["SYSTEM_R5", "admin"] }), { roles: ["SYSTEM_R5", "admin"] });
    assert.deepEqual(validateUserRolesBody({ roles: [] }), { roles: [] });
    for (const roles of [["SYSTEM_R6"], ["Admin"], [1], "admin", undefined]) {
      assert.throws(() => validateUserRolesBody({ roles }), { code: "invalid_request_roles" });
    }
    assert.throws(() => validateTelegramLogToggleBody({ enabled: 1 }), { code: "invalid_request_enabled" });
    assert.equal(validateRequestIdParam("req_ABCDEF012345"), "req_ABCDEF012345");
    assert.equal(validateRequestIdParam("req_abcde"), "req_abcde");
    assert.throws(() => validateRequestIdParam("req_abcdef"), { code: "invalid_request_requestId" });
  });

  test("parseRecentLogsLimit: default 3, clamped to 1..20", () => {
    for (const [raw, expected] of [
      [undefined, 3],
      ["", 3],
      ["abc", 3],
      ["0", 3],
      ["-4", 1],
      ["5", 5],
      ["2.5", 2.5],
      ["99", 20],
      [["5", "6"], 3],
    ] as const) {
      assert.equal(parseRecentLogsLimit(raw), expected, String(raw));
    }
  });
});

describe("Auth helpers and mappers", () => {
  test("isStaleUnverified: only unverified rows whose code lapsed (or never had one)", () => {
    const now = 1_000;
    assert.equal(isStaleUnverified({ email_verified: 1, verify_code_expires_at: null }, now), false);
    assert.equal(isStaleUnverified({ email_verified: 0, verify_code_expires_at: 2_000 }, now), false);
    assert.equal(isStaleUnverified({ email_verified: 0, verify_code_expires_at: 1_000 }, now), false);
    assert.equal(isStaleUnverified({ email_verified: 0, verify_code_expires_at: 999 }, now), true);
    assert.equal(isStaleUnverified({ email_verified: 0, verify_code_expires_at: null }, now), true);
  });

  test("generateOtp: 6 digits, zero-padded, from crypto.randomInt(0, 1_000_000) (A5)", (t) => {
    for (let i = 0; i < 200; i++) assert.match(generateOtp(), /^\d{6}$/);
    const randomInt = t.mock.method(crypto, "randomInt", () => 42);
    assert.equal(generateOtp(), "000042");
    assert.deepEqual(randomInt.mock.calls[0].arguments, [0, 1_000_000]);
  });

  test("constants keep their security values", () => {
    assert.equal(OTP_TTL_MS, 15 * Time.MINUTE_MS);
    assert.equal(MAX_VERIFY_ATTEMPTS, 5);
    assert.equal(BCRYPT_SALT_ROUNDS, 10);
    assert.equal(DEV_OTP_BYPASS_CODE, "111111");
    assert.equal(IS_DEV, process.env.NODE_ENV === "dev");
  });

  test("toAdminUserDto: camelCase, parsed roles, nulls for missing values", () => {
    const dto = toAdminUserDto({
      id: 7,
      username: "u",
      email: undefined,
      system: "fnd",
      roles: '{"not":"an array"}',
      state: "ACTIVE",
      last_logged_in_dt: undefined as never,
      created_dt: 5,
      password: "hash",
      token: "secret",
      created_by: "SYSTEM",
      record_status: "A",
    });
    assert.deepEqual(dto, {
      id: 7,
      username: "u",
      email: null,
      system: "fnd",
      roles: [],
      state: "ACTIVE",
      lastLoggedInDt: null,
      createdDt: 5,
    });
  });

  test("mail builders escape the username and carry the code / recipient", () => {
    const otp = verificationCodeMail("a@b.co", `<img src=x onerror="1">`, "012345", 15);
    assert.equal(otp.to, "a@b.co");
    assert.equal(otp.subject, "012345 is your verification code");
    assert.ok(otp.html!.includes("&lt;img src=x onerror=&quot;1&quot;&gt;"));
    assert.ok(!otp.html!.includes("<img"));
    assert.ok(otp.html!.includes("<strong>15 minutes</strong>"));

    const changed = passwordChangedMail("a@b.co", "<b>");
    assert.equal(changed.to, "a@b.co");
    assert.equal(changed.subject, "Your Awense password has been changed");
    assert.ok(changed.html!.includes("&lt;b&gt;"));
    assert.ok(changed.html!.includes("<p>Your password was successfully changed.</p>"));
    assert.ok(changed.html!.includes("If you did not make this change, please contact us immediately"));
  });

  test("Permission: parseRoles and isValidRole", () => {
    assert.deepEqual(parseRoles('["SYSTEM_R5"]'), ["SYSTEM_R5"]);
    for (const raw of [null, undefined, "", "nope", '{"a":1}']) assert.deepEqual(parseRoles(raw), []);
    assert.equal(isValidRole("TRAVEL_R4"), true);
    assert.equal(isValidRole("admin"), true);
    for (const bad of ["SYSTEM_r5", "SYSTEM_R0", "_R1", "ADMIN", 5]) assert.equal(isValidRole(bad), false);
  });

  test("PermissionService.listGrants binds the active status instead of an inline 'A'", async () => {
    const calls: unknown[][] = [];
    const svc = new PermissionService({
      raw: async (sql: string, bindings: unknown[]) => {
        calls.push([sql, bindings]);
        return [];
      },
    } as never);
    await svc.listGrants(ResourceType.ANALYTICS_SYSTEM, "fndom");
    assert.ok(!String(calls[0][0]).includes("'A'"));
    // The user join filters on the active status too: a soft-deleted user's grant isn't listed.
    assert.match(String(calls[0][0]), /JOIN tb_aa_user u ON u\.id = ra\.user_id AND u\.record_status = \?/);
    assert.deepEqual(calls[0][1], ["A", "analytics_system", "fndom", "A"]);
  });

  test("PermissionService: every method adds one SERVICE event and passes it to each DB call (Y3)", async () => {
    const seen: { method: string; event: unknown }[] = [];
    let existing: Row | undefined;
    const record =
      (method: string, result: () => unknown) =>
      async (...args: unknown[]) => {
        seen.push({ method, event: args.at(-1) });
        return result();
      };
    const svc = new PermissionService({
      findOne: record("findOne", () => existing),
      find: record("find", () => [{ resource_key: "fndom" }]),
      raw: record("raw", () => []),
      update: record("update", () => []),
      insert: record("insert", () => ({})),
    } as never);
    const user = { id: 3, username: "v", system: SYSTEM, roles: [], lastLoggedInDt: 0 };
    const type = ResourceType.ANALYTICS_SYSTEM;
    const calls: [string, (ctx: never) => Promise<unknown>, string[]][] = [
      ["Check resource access", (ctx) => svc.canAccessResource(user, type, "fndom", ctx), ["findOne"]],
      ["List granted resource keys", (ctx) => svc.grantedKeys(3, type, ctx), ["find"]],
      ["List resource grants", (ctx) => svc.listGrants(type, "fndom", ctx), ["raw"]],
      ["Grant resource access", (ctx) => svc.grant(type, "fndom", 3, 1, ctx), ["findOne", "insert"]],
      ["Revoke resource access", (ctx) => svc.revoke(type, "fndom", 3, ctx), ["update"]],
    ];
    for (const [label, run, methods] of calls) {
      seen.length = 0;
      const ctx = { requestId: "t", startTime: 0, method: "POST", path: "/", ip: "", events: [] as Row[] };
      await run(ctx as never);
      assert.equal(ctx.events.length, 1, label);
      assert.equal(ctx.events[0].message, label);
      assert.deepEqual(
        seen.map((c) => c.method),
        methods,
        label,
      );
      for (const call of seen) assert.equal(call.event, ctx.events[0], `${label} ${call.method}`);
    }
    existing = { id: 9 };
    seen.length = 0;
    await svc.grant(type, "fndom", 3, 1);
    assert.deepEqual(
      seen.map((c) => c.method),
      ["findOne", "update"],
    );
  });

  test("P1 migration: stripRoles removes PPHS_R4 / PPHS_R5 and leaves everything else alone", () => {
    assert.deepEqual(PPHS_ROLES, ["PPHS_R4", "PPHS_R5"]);
    assert.equal(stripRoles('["SYSTEM_R5","PPHS_R5","KS_R5"]', PPHS_ROLES), '["SYSTEM_R5","KS_R5"]');
    assert.equal(stripRoles('["PPHS_R4"]', PPHS_ROLES), "[]");
    assert.equal(stripRoles('["PPHS_R4","PPHS_R4","TRAVEL_R4"]', PPHS_ROLES), '["TRAVEL_R4"]');
    // Nothing to strip, or not a JSON array → null (row left untouched).
    for (const raw of ['["SYSTEM_R5"]', '["PPHS_R3","XPPHS_R4"]', "[]", "R5", '{"PPHS_R4":1}', "", null]) {
      assert.equal(stripRoles(raw, PPHS_ROLES), null, String(raw));
    }
  });
});

describe("AuthRegistrationService (injected fakes)", () => {
  async function pending(store: ReturnType<typeof fakeDb>, over: Row = {}) {
    return store.db.insert(USER_TABLE, {
      username: "dev",
      email: "dev@example.com",
      email_verified: 0,
      verify_code: sha256Hex("424242"),
      verify_code_expires_at: Date.now() - 1, // lapsed: only the bypass can pass
      verify_attempts: 0,
      password: await bcrypt.hash(PASSWORD, 4),
      system: SYSTEM,
      roles: "[]",
      username_system: `dev_${SYSTEM}`,
      state: "REGISTER",
      last_logged_in_dt: 0,
      created_dt: 0,
      created_by: "SYSTEM",
      record_status: "A",
      ...over,
    });
  }
  const body = { email: "dev@example.com", system: SYSTEM, password: PASSWORD, code: DEV_OTP_BYPASS_CODE };

  test("dev bypass on: 111111 verifies even a lapsed code (still needs the password)", async () => {
    const store = fakeDb();
    const user = await pending(store);
    const svc = new AuthRegistrationService(store.db as never, undefined, { devOtpBypass: true });
    await assert.rejects(svc.verifyEmail({ ...body, password: "Wr0ng!pass" }), {
      code: "invalid_login_credentials",
    });
    const { token, session } = await svc.verifyEmail(body);
    assert.deepEqual(session, { username: "dev", roles: [] });
    assert.equal(user.email_verified, 1);
    assert.equal(user.verify_attempts, 0);
    assert.equal(user.token, token);
  });

  test("dev bypass off: 111111 is just a code (expired → 400, wrong → 401 + attempt)", async () => {
    const store = fakeDb();
    const lapsed = await pending(store);
    const svc = new AuthRegistrationService(store.db as never, undefined, { devOtpBypass: false });
    await assert.rejects(svc.verifyEmail(body), { code: "code_expired" });
    assert.equal(lapsed.email_verified, 0);

    lapsed.verify_code_expires_at = Date.now() + Time.MINUTE_MS;
    await assert.rejects(svc.verifyEmail(body), { code: "invalid_login_credentials" });
    assert.equal(lapsed.verify_attempts, 1);
    assert.equal(lapsed.email_verified, 0);
  });

  test("register stores the hash of the generated code; insert failure → registration_failed", async (t) => {
    const mailed: MailOptions[] = [];
    t.mock.method(MailerUtilities, "sendMail", async (options: MailOptions) => {
      mailed.push(options);
    });
    const store = fakeDb();
    const svc = new AuthRegistrationService(store.db as never, undefined, { generateCode: () => "000123" });
    const reg = { username: "fixed", email: "fixed@example.com", password: PASSWORD, system: SYSTEM };
    assert.deepEqual(await svc.register(reg), { requiresVerification: true, email: "fixed@example.com" });
    assert.equal(store.tables[USER_TABLE][0].verify_code, sha256Hex("000123"));
    assert.equal(mailed[0].subject, "000123 is your verification code");

    const broken = { ...store.db, insert: async () => Promise.reject(new Error("db down")) };
    const failing = new AuthRegistrationService(broken as never);
    await assert.rejects(failing.register({ ...reg, username: "other", email: "other@example.com" }), {
      code: "registration_failed",
    });
  });
});

describe("AuthSessionService.invalidateSession", () => {
  test("never throws: forged token or DB failure still lets logout finish", async () => {
    const svc = new AuthSessionService({ update: async () => Promise.reject(new Error("db down")) } as never);
    await svc.invalidateSession("forged");
    await svc.invalidateSession(signToken({ id: 1, username: "u", system: SYSTEM, roles: [], lastLoggedInDt: 0 }));
  });
});
