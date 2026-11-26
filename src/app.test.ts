import { describe, test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import type KnexSqlUtilities from "./utils/KnexSqlUtilities.js";
import type { CameraService } from "./camera/Camera.service.js";
import { LoggingUtilities } from "./utils/logging/LoggingUtilities.js";
import { TelegramLogSubscriptionService } from "./utils/logging/TelegramLogSubscriptionService.js";

// The real app (route table, CORS, headers, 404, ErrorHandler) over a fake DB. Nothing leaves the
// machine: request-log flushes and Telegram target lookups are stubbed, the DB only answers SELECT 1.

const ALLOWED = "https://app.example";
const FOREIGN = "https://evil.example";
const UA = { "User-Agent": "app-test" };

const fakeDb = {
  async raw() {
    return [];
  },
} as unknown as KnexSqlUtilities;

async function listen(isPrd: boolean): Promise<{ server: Server; base: string }> {
  const app = createApp({ db: fakeDb, cameraService: {} as CameraService, allowedOrigins: [ALLOWED] }, { isPrd });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

let dev: { server: Server; base: string };
let prd: { server: Server; base: string };

before(async () => {
  mock.method(LoggingUtilities.request, "flush", () => {});
  mock.method(TelegramLogSubscriptionService.prototype, "listSubscribedChatIdsCached", async () => []);
  mock.method(LoggingUtilities.service, "error", () => {});
  dev = await listen(false);
  prd = await listen(true);
});

after(async () => {
  mock.restoreAll();
  await Promise.all([close(dev.server), close(prd.server)]);
});

describe("route table + 404", () => {
  test("GET /connectivity → 200 with data.status 'ok' (deploy.sh health check)", async () => {
    const res = await fetch(`${dev.base}/connectivity`, { headers: UA });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { data: { status: string; database: string } };
    assert.equal(json.data.status, "ok");
    assert.equal(json.data.database, "up");
  });

  test("unknown path → JSON 404 envelope", async () => {
    const res = await fetch(`${dev.base}/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { code: 404, status: "Not Found", data: "Not Found" });
  });

  test("/debug is open in dev and needs a login in prd", async () => {
    const open = await fetch(`${dev.base}/debug/status/201`, { headers: UA });
    assert.equal(open.status, 201);
    assert.deepEqual(((await open.json()) as { data: unknown }).data, { simulated: 201 });

    const locked = await fetch(`${prd.base}/debug/status/201`, { headers: UA });
    assert.equal(locked.status, 401);
    assert.equal(((await locked.json()) as { status: string }).status, "token_invalid");
  });

  test("auth presets still apply (e.g. /todo without a cookie → 401 token_invalid)", async () => {
    const res = await fetch(`${dev.base}/todo`, { headers: UA });
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { status: string }).status, "token_invalid");
  });

  test("JSON bodies over 5 MB → 413", async () => {
    const res = await fetch(`${dev.base}/connectivity`, {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/json" },
      body: JSON.stringify({ blob: "x".repeat(5 * 1024 * 1024 + 1) }),
    });
    assert.equal(res.status, 413);
  });
});

describe("security headers", () => {
  test("dev: nosniff, DENY, no-referrer, no HSTS, no x-powered-by", async () => {
    const res = await fetch(`${dev.base}/nope`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.equal(res.headers.get("strict-transport-security"), null);
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  test("prd: HSTS added", async () => {
    const res = await fetch(`${prd.base}/nope`);
    assert.equal(res.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  });
});

describe("CORS", () => {
  test("foreign origin → 403 registry ForbiddenAccess body, no allow-origin header", async () => {
    const res = await fetch(`${dev.base}/connectivity`, { headers: { ...UA, Origin: FOREIGN } });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    const json = (await res.json()) as { code: number; status: string; data: Record<string, unknown> };
    assert.equal(json.code, 403);
    assert.equal(json.status, "Forbidden");
    assert.equal(json.data.code, "forbidden_access");
    assert.equal(json.data.message, `CORS: origin '${FOREIGN}' not allowed`);
    assert.equal(typeof json.data.timestamp, "number");
  });

  test("allowed origin → echoed with credentials", async () => {
    const res = await fetch(`${dev.base}/connectivity`, { headers: { ...UA, Origin: ALLOWED } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  });

  test("no Origin (Shortcuts, curl) → passes without CORS headers", async () => {
    const res = await fetch(`${dev.base}/connectivity`, { headers: UA });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  test("preflight from an allowed origin → 204 on any path, before the rate limiter", async () => {
    const res = await fetch(`${dev.base}/todo/1/update`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED, "Access-Control-Request-Method": "POST" },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.equal(res.headers.get("access-control-allow-methods"), "GET,POST,DELETE,OPTIONS");
    assert.equal(res.headers.get("ratelimit-policy"), null);
  });

  test("preflight from a foreign origin → 403", async () => {
    const res = await fetch(`${dev.base}/todo`, {
      method: "OPTIONS",
      headers: { Origin: FOREIGN, "Access-Control-Request-Method": "POST" },
    });
    assert.equal(res.status, 403);
  });
});
