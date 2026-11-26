import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { RequestHandler } from "express";
import createDebugController from "./Debug.controller.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

// The controller on a throwaway server (non-prd: IS_PRD is false under `npm test`), so the OWNER
// check is skipped here; the prd lock is covered in app.test.ts.

describe("HTTP /debug/status/:code", () => {
  let server: Server;
  let base: string;

  before(async () => {
    mock.method(LoggingUtilities.service, "error", () => {});
    const app = express();
    const fakeLogContext: RequestHandler = (req, _res, next) => {
      req.logContext = {
        requestId: "test",
        startTime: 0,
        method: req.method,
        path: req.path,
        ip: "",
        events: [],
      } as never;
      next();
    };
    app.use(fakeLogContext);
    app.use("/debug", createDebugController());
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/debug/status`;
  });

  after(async () => {
    mock.restoreAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const get = async (code: string) => {
    const res = await fetch(`${base}/${code}`);
    return { status: res.status, json: (await res.json()) as { code: number; status: string; data: any } };
  };

  test("2xx → that status, OK envelope with { simulated }", async () => {
    for (const code of [200, 201, 299]) {
      const { status, json } = await get(String(code));
      assert.equal(status, code);
      assert.equal(json.code, code);
      assert.equal(json.status, "Ok");
      assert.deepEqual(json.data, { simulated: code });
    }
  });

  test("3xx / 4xx → that status, status text debug_<code>, message body", async () => {
    for (const code of [300, 404, 499]) {
      const { status, json } = await get(String(code));
      assert.equal(status, code);
      assert.equal(json.status, `debug_${code}`);
      assert.equal(json.data, `Simulated ${code} response`);
    }
  });

  test("5xx other than 500 → that status with Ko status text", async () => {
    for (const code of [501, 503, 599]) {
      const { status, json } = await get(String(code));
      assert.equal(status, code);
      assert.equal(json.status, "Ko");
      assert.equal(json.data, `Simulated ${code} response`);
    }
  });

  test("500 → a real thrown error routed to the 500 fallback, logged to the service error log", async () => {
    const errorLog = LoggingUtilities.service.error as unknown as { mock: { callCount(): number } };
    const before = errorLog.mock.callCount();
    const { status, json } = await get("500");
    assert.equal(status, 500);
    assert.equal(json.status, "Ko");
    assert.equal(json.data, "Simulated failure");
    assert.equal(errorLog.mock.callCount(), before + 1);
  });

  test("out-of-range or non-integer codes → 400 invalid_request_code", async () => {
    for (const code of ["199", "600", "0", "-200", "200.5", "abc", "1e3"]) {
      const { status, json } = await get(code);
      assert.equal(status, 400, code);
      assert.equal(json.data.code, "invalid_request_code", code);
    }
  });
});
