import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { RequestHandler } from "express";
import createConnectivityController from "./Connectivity.controller.js";
import { ConnectivityService } from "./Connectivity.service.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

/** Stand-in for KnexSqlUtilities.raw: records the SQL, and fails while `down` is set. */
function fakeDb() {
  const state = { down: false, sql: [] as string[] };
  const db = {
    async raw(sql: string) {
      state.sql.push(sql);
      if (state.down) throw new Error("connect ECONNREFUSED");
      return [];
    },
  };
  return { db: db as never, state };
}

describe("ConnectivityService.statistics", () => {
  test("pings the DB with SELECT 1 and reports ok / up with an ISO timestamp", async () => {
    const { db, state } = fakeDb();
    const dto = await new ConnectivityService(db).statistics();
    assert.deepEqual(state.sql, ["SELECT 1"]);
    assert.equal(dto.status, "ok");
    assert.equal(dto.database, "up");
    assert.equal(dto.message, "Server is connected");
    assert.equal(typeof dto.environment, "string");
    assert.equal(new Date(dto.timestamp).toISOString(), dto.timestamp);
  });

  test("a failed DB ping rejects (so the health check is not reported ok)", async () => {
    const { db, state } = fakeDb();
    state.down = true;
    await assert.rejects(new ConnectivityService(db).statistics(), /ECONNREFUSED/);
  });
});

describe("HTTP /connectivity", () => {
  let server: Server;
  let base: string;
  const { db, state } = fakeDb();

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
    app.use("/connectivity", createConnectivityController(db));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/connectivity`;
  });

  after(async () => {
    mock.restoreAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('DB up → 200 and a body containing "status":"ok" (what deploy.sh greps for)', async () => {
    state.down = false;
    const res = await fetch(base);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /"status":"ok"/);
    assert.equal(JSON.parse(text).data.database, "up");
  });

  test('DB down → 500 with the fallback message and no "status":"ok" in the body', async () => {
    state.down = true;
    const res = await fetch(base);
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.doesNotMatch(text, /"status":"ok"/);
    const json = JSON.parse(text);
    assert.equal(json.status, "Ko");
    assert.equal(json.data, "Failed to load connectivity stats");
    state.down = false;
  });
});
