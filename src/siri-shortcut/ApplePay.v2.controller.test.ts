import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import createSsApplePayControllerV2, { parseMerchant } from "./ApplePay.v2.controller.js";

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

  test("UOB format still parses (numeric date but no 'by')", () => {
    assert.equal(parseMerchant(UOB_DOUYIN), "Douyin Live");
  });

  test("DBS format still parses", () => {
    assert.equal(parseMerchant(DBS_7ELEVEN), "7-ELEVEN -TAMPINES MAR");
  });

  test("generic 'at' with trailing period at end of string", () => {
    assert.equal(parseMerchant("SGD 3.00 spent at Kopitiam."), "Kopitiam");
  });

  test("returns null when no merchant can be found", () => {
    assert.equal(parseMerchant("Your OTP is 123456. Do not share it."), null);
    assert.equal(parseMerchant(""), null);
  });
});

// ---------------------------------------------------------------------------
// HTTP: POST /ap/sms with an in-memory fake DB (no MySQL needed).
// ---------------------------------------------------------------------------

type Inserted = { table: string; data: Record<string, any> };

describe("POST /ap/sms", () => {
  const inserts: Inserted[] = [];
  let server: Server;
  let baseUrl: string;

  const fakeDb = {
    async insert(table: string, data: Record<string, any>) {
      inserts.push({ table, data });
      return { id: inserts.length, record_status: "A", ...data };
    },
  };

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      // Mimic the API-key filter having resolved the user.
      req.logContext = {
        requestId: "test",
        currentStage: "controller",
        startTime: 0,
        method: req.method,
        path: req.path,
        ip: "127.0.0.1",
        events: [],
        metadata: { userId: 42 },
      };
      next();
    });
    app.use("/v2/ss", createSsApplePayControllerV2(fakeDb as any));
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function post(body: unknown) {
    inserts.length = 0;
    const res = await fetch(`${baseUrl}/v2/ss/ap/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  }

  test("Citi SMS: parses currency, amount, merchant and card, and stores currency", async () => {
    const { status, json } = await post({ smsBody: CITI_TIKTOK });
    assert.equal(status, 200);
    assert.equal(json.data.amount, 11.25);
    assert.equal(json.data.currency, "SGD");
    assert.equal(json.data.merchant, "TikTok Shop Seller");
    assert.equal(json.data.cardLast4, "3284");
    assert.equal(typeof json.data.timestamp, "number");

    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].table, "tb_applepay_transaction");
    assert.equal(inserts[0].data.currency, "SGD");
    assert.equal(inserts[0].data.amount, 11.25);
    assert.equal(inserts[0].data.source, "v2");
    assert.equal(inserts[0].data.card_last4, "3284");
    assert.equal(inserts[0].data.created_by_id, 42);
  });

  test("Citi foreign-merchant SMS (Spotify)", async () => {
    const { status, json } = await post({ smsBody: CITI_SPOTIFY });
    assert.equal(status, 200);
    assert.equal(json.data.merchant, "Spotify P480A42C6A");
    assert.equal(json.data.amount, 11.98);
  });

  test("Citi SPAYLATER SMS", async () => {
    const { status, json } = await post({ smsBody: CITI_SPAYLATER });
    assert.equal(status, 200);
    assert.equal(json.data.merchant, "SPAYLATER SG");
    assert.equal(json.data.amount, 25);
  });

  test("UOB SMS still parses", async () => {
    const { status, json } = await post({ smsBody: UOB_DOUYIN });
    assert.equal(status, 200);
    assert.equal(json.data.amount, 1.99);
    assert.equal(json.data.currency, "SGD");
    assert.equal(json.data.merchant, "Douyin Live");
    assert.equal(json.data.cardLast4, "1986");
  });

  test("DBS SMS still parses", async () => {
    const { status, json } = await post({ smsBody: DBS_7ELEVEN });
    assert.equal(status, 200);
    assert.equal(json.data.amount, 4.2);
    assert.equal(json.data.merchant, "7-ELEVEN -TAMPINES MAR");
    assert.equal(json.data.cardLast4, "5244");
  });

  test("foreign currency is captured as-is, not converted", async () => {
    const sms = UOB_DOUYIN.replace("SGD 1.99", "CNY 1,288.00");
    const { status, json } = await post({ smsBody: sms });
    assert.equal(status, 200);
    assert.equal(json.data.currency, "CNY");
    assert.equal(json.data.amount, 1288);
    assert.equal(inserts[0].data.currency, "CNY");
  });

  test("missing amount -> 400, nothing inserted", async () => {
    const { status, json } = await post({ smsBody: "Payment made at Kopitiam." });
    assert.equal(status, 400);
    assert.match(JSON.stringify(json), /amount/);
    assert.equal(inserts.length, 0);
  });

  test("missing merchant -> 400, nothing inserted", async () => {
    const { status, json } = await post({ smsBody: "You spent SGD 5.00 today" });
    assert.equal(status, 400);
    assert.match(JSON.stringify(json), /merchant/);
    assert.equal(inserts.length, 0);
  });

  test("missing smsBody -> 400", async () => {
    const { status } = await post({});
    assert.equal(status, 400);
    assert.equal(inserts.length, 0);
  });
});
