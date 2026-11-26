import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { NextFunction, Request, Response } from "express";
import { parseAmount, parseCardLast4, parseMerchant } from "./ApplePaySms.parser.js";
import { validateSmsBody } from "./SiriShortcut.validator.js";
import createSsTodoControllerV1 from "./Todo.v1.controller.js";
import { BaseException } from "../exceptions/AppExceptions.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";

// Real alert texts (card digits anonymised), one per bank format.
const CITI_TIKTOK =
  "There was a charge of SGD11.25 on your Card ending 3284 by TikTok Shop Seller    Singapore    SGP on 14/10/26 18:13. If unauthorized, call our hotline.";
const CITI_SPOTIFY =
  "There was a charge of SGD11.98 on your Card ending 3284 by Spotify P480A42C6A    Stockholm    SWE on 16/10/26 01:12. If unauthorized, call our hotline.";
const CITI_SPAYLATER =
  "There was a charge of SGD25.00 on your Card ending 3284 by SPAYLATER SG         Singapore SGP on 01/11/26 05:32. If unauthorized, call our hotline.";
const UOB_DOUYIN =
  "A transaction of SGD 1.99 was made with your UOB Card ending 1986 on 13/10/26 at Douyin Live. If unauthorised, call 24/7 Fraud Hotline now";
const DBS_7ELEVEN =
  "Transaction Alert: Your DBS/POSB card ending 5244 transaction of SGD 4.20 to 7-ELEVEN -TAMPINES MAR on 27 SEP 12:44 (SGT) was completed. If unauthorised, call 18001111111.";

/** Asserts `fn` throws an `InvalidRequest` for `field`. */
function assertInvalid(fn: () => unknown, field: string) {
  assert.throws(fn, (err: unknown) => err instanceof BaseException && err.code === `invalid_request_${field}`);
}

// ── Parser ──

describe("parseMerchant", () => {
  test("Citi: strips padded city/country (TikTok)", () => {
    assert.equal(parseMerchant(CITI_TIKTOK), "TikTok Shop Seller");
  });

  test("Citi: keeps alphanumeric descriptor, drops foreign city/country (Spotify)", () => {
    assert.equal(parseMerchant(CITI_SPOTIFY), "Spotify P480A42C6A");
  });

  test("Citi: single-space-separated words inside merchant are kept (SPAYLATER SG)", () => {
    assert.equal(parseMerchant(CITI_SPAYLATER), "SPAYLATER SG");
  });

  test("Citi: collapsed spacing keeps the whole descriptor rather than guessing", () => {
    const sms =
      "There was a charge of SGD11.25 on your Card ending 3284 by TikTok Shop Seller Singapore SGP on 14/10/26 18:13. If unauthorized, call our hotline.";
    assert.equal(parseMerchant(sms), "TikTok Shop Seller Singapore SGP");
  });

  test("Citi: 4-digit year date is also recognised", () => {
    const sms =
      "There was a charge of SGD5.00 on your Card ending 3284 by GRAB    Singapore    SGP on 14/10/2026 18:13.";
    assert.equal(parseMerchant(sms), "GRAB");
  });

  test("UOB: merchant after 'at', up to '. If unauthorised'", () => {
    assert.equal(parseMerchant(UOB_DOUYIN), "Douyin Live");
  });

  test("DBS: merchant after 'to', up to 'on <day> <MON>'", () => {
    assert.equal(parseMerchant(DBS_7ELEVEN), "7-ELEVEN -TAMPINES MAR");
  });

  test("generic 'at' with trailing period at end of string", () => {
    assert.equal(parseMerchant("SGD 3.00 spent at Kopitiam."), "Kopitiam");
  });

  test("returns null when no merchant can be found", () => {
    assert.equal(parseMerchant("Your OTP is 123456. Do not share it."), null);
    assert.equal(parseMerchant(""), null);
  });

  test("adversarial whitespace runs finish quickly (the old Citi regex took ~4 s on this)", () => {
    const started = Date.now();
    parseMerchant(`by${" ".repeat(2000)}`);
    parseMerchant(`at${" ".repeat(2000)}x`);
    parseMerchant("by x ".repeat(400));
    assert.ok(Date.now() - started < 200);
  });
});

describe("parseAmount", () => {
  test("UOB/DBS 'SGD 1.99' and Citi 'SGD11.25' (no space)", () => {
    assert.deepEqual(parseAmount(UOB_DOUYIN), { currency: "SGD", amount: 1.99 });
    assert.deepEqual(parseAmount(DBS_7ELEVEN), { currency: "SGD", amount: 4.2 });
    assert.deepEqual(parseAmount(CITI_TIKTOK), { currency: "SGD", amount: 11.25 });
  });

  test("thousands separators are dropped and foreign currency kept", () => {
    assert.deepEqual(parseAmount("A transaction of CNY 1,288.00 was made"), { currency: "CNY", amount: 1288 });
  });

  test("null without a currency + 2-decimal amount", () => {
    assert.equal(parseAmount("Payment made at Kopitiam."), null);
    assert.equal(parseAmount("You spent SGD 5 today"), null);
  });
});

describe("parseCardLast4", () => {
  test("reads the digits of each bank format", () => {
    assert.equal(parseCardLast4(UOB_DOUYIN), "1986");
    assert.equal(parseCardLast4(DBS_7ELEVEN), "5244");
    assert.equal(parseCardLast4(CITI_TIKTOK), "3284");
    assert.equal(parseCardLast4("card ending 123 used"), "123");
  });

  test("null when the template has no card digits", () => {
    assert.equal(parseCardLast4("SGD 3.00 spent at Kopitiam."), null);
  });
});

// ── Validators ──

describe("validateSmsBody (V2)", () => {
  test("parses each bank format into the service input", () => {
    assert.deepEqual(validateSmsBody({ smsBody: DBS_7ELEVEN }), {
      amount: 4.2,
      currency: "SGD",
      merchant: "7-ELEVEN -TAMPINES MAR",
      cardLast4: "5244",
    });
    assert.equal(validateSmsBody({ smsBody: CITI_SPOTIFY }).merchant, "Spotify P480A42C6A");
    assert.equal(validateSmsBody({ smsBody: UOB_DOUYIN }).cardLast4, "1986");
  });

  test("card digits are optional", () => {
    assert.equal(validateSmsBody({ smsBody: "SGD 3.00 spent at Kopitiam." }).cardLast4, null);
  });

  test("smsBody: required string, ≤2000 chars", () => {
    assertInvalid(() => validateSmsBody({}), "smsBody");
    assertInvalid(() => validateSmsBody({ smsBody: 1 }), "smsBody");
    assertInvalid(() => validateSmsBody({ smsBody: "   " }), "smsBody");
    assertInvalid(() => validateSmsBody({ smsBody: `SGD 1.00 at x ${"y".repeat(2000)}` }), "smsBody");
  });

  test("missing amount / merchant, oversized merchant or amount → 400 on that field", () => {
    assertInvalid(() => validateSmsBody({ smsBody: "Payment made at Kopitiam." }), "amount");
    assertInvalid(() => validateSmsBody({ smsBody: "You spent SGD 5.00 today" }), "merchant");
    assertInvalid(() => validateSmsBody({ smsBody: `SGD 5.00 spent at ${"M".repeat(256)}.` }), "merchant");
    assertInvalid(() => validateSmsBody({ smsBody: "SGD 100,000,000.00 spent at Shop." }), "amount");
  });
});

// ── HTTP: /v1/ss widget route (the V1 Apple Pay routes were removed in Nov 2026), in-process with a fake DB ──

type Row = Record<string, unknown>;

describe("HTTP /v1/ss", () => {
  const tasks: Row[] = [
    { uuid: "a", title: "Old", done: 0, pinned: 0, sort_order: 1 },
    { uuid: "b", title: "Done", done: 1, pinned: 0, sort_order: 2 },
    { uuid: "c", title: "Pinned", done: 0, pinned: 1, sort_order: 3 },
  ];
  const fakeDb = {
    async find(table: string) {
      if (table === "tb_todo_task") return tasks;
      return [];
    },
  };

  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      // Mimic RequestApiKeyFilter resolving the key's owner (except under /no-user).
      const logContext: IRequestLogContext = {
        requestId: "test",
        currentStage: "controller",
        startTime: 0,
        method: req.method,
        path: req.path,
        ip: "127.0.0.1",
        events: [],
        metadata: req.path.startsWith("/no-user") ? {} : { userId: 42 },
      };
      req.logContext = logContext;
      next();
    });
    for (const prefix of ["/v1/ss", "/no-user"]) {
      app.use(prefix, createSsTodoControllerV1(fakeDb as never));
    }
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function get(path: string) {
    const res = await fetch(`${baseUrl}${path}`, { headers: { "Content-Type": "application/json" } });
    return { status: res.status, json: (await res.json()) as { data: Record<string, unknown> & unknown[] } };
  }

  test("GET /todo returns the widget feed { tasks, openCount }, pinned first", async () => {
    const { status, json } = await get("/v1/ss/todo");
    assert.equal(status, 200);
    assert.deepEqual(json.data, { tasks: ["Pinned", "Old"], openCount: 2 });
  });

  test("GET /todo → 401 when no API-key user was resolved", async () => {
    const { status } = await get("/no-user/todo");
    assert.equal(status, 401);
  });

  test("the removed V1 Apple Pay routes no longer match (404)", async () => {
    for (const method of ["POST", "GET"] as const) {
      const res = await fetch(`${baseUrl}/v1/ss/ap/transaction`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ amount: "1.00", merchant: "m", name: "n" }) : undefined,
      });
      assert.equal(res.status, 404, method);
    }
  });
});
