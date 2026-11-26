import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { attachCameraWebSockets, CameraWebSockets } from "./Camera.ws.js";
import { CameraRelay, DashboardConnection, PhoneConnection, RelaySocket } from "./Camera.relay.js";
import { CAMERA_MAX_FRAME_BYTES, CAMERA_MAX_TEXT_BYTES, WS_CLOSE_INTERNAL_ERROR } from "./Camera.protocol.js";
import { CameraDeviceIdentity } from "./Camera.types.js";

// Real `ws` sockets against attachCameraWebSockets on an ephemeral local port, with a fake
// device/user lookup. Feeds malformed upgrades, frames and messages, and handlers that throw,
// and asserts the process never sees an uncaught exception or unhandled rejection.

const ORIGIN = "https://camera.test";
const PHONE_TOKEN = "p".repeat(43);
const BROKEN_TOKEN = "b".repeat(43);
const THROWING_SETUP_TOKEN = "s".repeat(43);
const DEVICE: CameraDeviceIdentity = { deviceId: "aaaaaaaa-0000-4000-8000-000000000001", userId: 1, name: "iPhone" };
const THROW_TEXT = '{"type":"boom"}';
const HEARTBEAT_MS = 40;

const crashes: unknown[] = [];
const onCrash = (err: unknown) => crashes.push(err);

/** Real relay, except it can be told to throw from inside socket callbacks. */
class TrapRelay extends CameraRelay {
  override onPhoneText(conn: PhoneConnection, text: string): void {
    if (text === THROW_TEXT) throw new Error("relay bug (phone text)");
    super.onPhoneText(conn, text);
  }
  override onDashboardText(conn: DashboardConnection, text: string): void {
    if (text === THROW_TEXT) throw new Error("relay bug (dashboard text)");
    super.onDashboardText(conn, text);
  }
  override addPhone(socket: RelaySocket, device: CameraDeviceIdentity): PhoneConnection {
    if (device.name === "explode") throw new Error("relay bug (addPhone)");
    return super.addPhone(socket, device);
  }
}

const service = {
  touches: 0,
  async authenticateDevice(token: string): Promise<CameraDeviceIdentity | null> {
    if (token === PHONE_TOKEN) return DEVICE;
    if (token === THROWING_SETUP_TOKEN) return { ...DEVICE, name: "explode" };
    if (token === BROKEN_TOKEN) throw new Error("db down");
    return null;
  },
  async touch(): Promise<void> {
    service.touches++;
    throw new Error("touch failed"); // must be caught, never an unhandled rejection
  },
};

let server: http.Server;
let sockets: CameraWebSockets;
let port: number;
const open: WebSocket[] = [];

before(async () => {
  process.on("uncaughtException", onCrash);
  process.on("unhandledRejection", onCrash);
  server = http.createServer();
  sockets = attachCameraWebSockets(server, {
    service,
    relay: new TrapRelay(),
    allowedOrigins: [ORIGIN],
    resolveUser: async (token) => (token === "good" ? { id: 1 } : null),
    heartbeatMs: HEARTBEAT_MS,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const ws of open.splice(0)) ws.terminate();
  await tick(20);
  assert.deepEqual(crashes, [], "no uncaught exception / unhandled rejection");
});

after(async () => {
  sockets.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.off("uncaughtException", onCrash);
  process.off("unhandledRejection", onCrash);
});

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends a raw upgrade request and returns the HTTP status line's code (or "closed"). */
function rawUpgrade(path: string, headers: Record<string, string> = {}): Promise<number | "closed"> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      const lines = [
        `GET ${path} HTTP/1.1`,
        "Host: localhost",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      ];
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    });
    let settled = false;
    socket.on("data", (data) => {
      if (settled) return;
      settled = true;
      resolve(Number(data.toString().split(" ")[1]));
      socket.destroy();
    });
    socket.on("close", () => !settled && resolve("closed"));
    socket.on("error", () => {});
  });
}

interface Client {
  ws: WebSocket;
  texts: any[];
  frames: Buffer[];
  closed: Promise<number>;
}

function connect(path: string, headers: Record<string, string>): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    open.push(ws);
    const client: Client = {
      ws,
      texts: [],
      frames: [],
      closed: new Promise((done) => ws.on("close", (code) => done(code))),
    };
    ws.on("message", (data, isBinary) => {
      if (isBinary) client.frames.push(data as Buffer);
      else client.texts.push(JSON.parse(data.toString()));
    });
    ws.on("error", () => {}); // the server closing on us is expected in some tests
    ws.once("open", () => resolve(client));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}

const phone = () => connect("/camera/ws/phone", { Authorization: `Bearer ${PHONE_TOKEN}` });
const dashboard = () => connect("/camera/ws/dashboard", { Origin: ORIGIN, Cookie: "jwt_token=good" });

/** Waits until `predicate` holds (sockets are async), failing after `ms`. */
async function until(predicate: () => boolean, ms = 1000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await tick(5);
  }
}

const status = (fps: number) => JSON.stringify({ type: "status", status: { previewFps: fps } });

describe("upgrade handling", () => {
  test("an unparseable path (//) is a 400, not a crash", async () => {
    assert.equal(await rawUpgrade("//"), 400);
    assert.equal(await rawUpgrade("//"), 400);
  });

  test("unknown paths are 404", async () => {
    assert.equal(await rawUpgrade("/camera/ws/other"), 404);
  });

  test("phone: missing, malformed or unknown token is 401", async () => {
    assert.equal(await rawUpgrade("/camera/ws/phone"), 401);
    assert.equal(await rawUpgrade("/camera/ws/phone", { Authorization: "Basic abc" }), 401);
    assert.equal(await rawUpgrade("/camera/ws/phone", { Authorization: `Bearer ${"x".repeat(43)}` }), 401);
  });

  test("phone: a failing device lookup is a 500 and the server keeps serving", async () => {
    assert.equal(await rawUpgrade("/camera/ws/phone", { Authorization: `Bearer ${BROKEN_TOKEN}` }), 500);
    const ok = await phone();
    assert.equal(ok.ws.readyState, WebSocket.OPEN);
  });

  test("dashboard: Origin must be allowed (403) and the session valid (401)", async () => {
    assert.equal(await rawUpgrade("/camera/ws/dashboard", { Cookie: "jwt_token=good" }), 403);
    assert.equal(
      await rawUpgrade("/camera/ws/dashboard", { Origin: "https://evil.test", Cookie: "jwt_token=good" }),
      403,
    );
    assert.equal(await rawUpgrade("/camera/ws/dashboard", { Origin: ORIGIN }), 401);
    assert.equal(await rawUpgrade("/camera/ws/dashboard", { Origin: ORIGIN, Cookie: "jwt_token=bad" }), 401);
    assert.equal(await rawUpgrade("/camera/ws/dashboard", { Origin: ORIGIN, Cookie: "jwt_token=%E0%A4%A" }), 401);
  });

  test("an error while wiring up an accepted socket closes it with 1011", async () => {
    const client = await connect("/camera/ws/phone", { Authorization: `Bearer ${THROWING_SETUP_TOKEN}` });
    assert.equal(await client.closed, WS_CLOSE_INTERNAL_ERROR);
  });
});

describe("message handling survives bad input", () => {
  test("phone → dashboard: frames and status flow; touch failures are only logged", async () => {
    const dash = await dashboard();
    const cam = await phone();
    await until(() => dash.texts.some((m) => m.type === "device_online"));
    cam.ws.send(Buffer.from([0xff, 0xd8, 1]), { binary: true });
    cam.ws.send(status(12));
    await until(() => dash.frames.length === 1 && dash.texts.some((m) => m.type === "status"));
    assert.ok(service.touches >= 1);
  });

  test("malformed phone text (bad JSON, oversize, wrong shapes) is ignored", async () => {
    const dash = await dashboard();
    const cam = await phone();
    for (const junk of [
      "not json",
      "",
      "null",
      "[]",
      '{"type":null}',
      '{"type":"status","status":"x"}',
      '{"type":"ack","command":"nope"}',
      JSON.stringify({ type: "status", status: {}, pad: "x".repeat(CAMERA_MAX_TEXT_BYTES) }),
    ]) {
      cam.ws.send(junk);
    }
    cam.ws.send(Buffer.alloc(0), { binary: true });
    cam.ws.send(status(7));
    await until(() => dash.texts.some((m) => m.type === "status" && m.status.previewFps === 7));
    assert.equal(dash.texts.filter((m) => m.type === "status").length, 1);
    assert.equal(cam.ws.readyState, WebSocket.OPEN);
  });

  test("a handler that throws is logged; the socket and the process carry on", async () => {
    const dash = await dashboard();
    const cam = await phone();
    cam.ws.send(THROW_TEXT);
    dash.ws.send(THROW_TEXT);
    cam.ws.send(status(3));
    await until(() => dash.texts.some((m) => m.type === "status" && m.status.previewFps === 3));
    dash.ws.send(JSON.stringify({ type: "start", target: "all", requestId: "r1" }));
    await until(() => cam.texts.some((m) => m.type === "start"));
    await until(() => dash.texts.some((m) => m.type === "command_result"));
  });

  test("malformed dashboard input (binary, bad JSON, bad commands) is ignored", async () => {
    const dash = await dashboard();
    const cam = await phone();
    dash.ws.send(Buffer.from([1, 2, 3]), { binary: true });
    for (const junk of [
      "{",
      '{"type":"start"}',
      '{"type":"start","target":""}',
      '{"type":"set_quality","target":"all","quality":"8k"}',
      JSON.stringify({ type: "start", target: "all", pad: "x".repeat(CAMERA_MAX_TEXT_BYTES) }),
    ]) {
      dash.ws.send(junk);
    }
    dash.ws.send(JSON.stringify({ type: "stop", target: "all", requestId: "ok" }));
    await until(() => cam.texts.some((m) => m.type === "stop"));
    assert.equal(cam.texts.filter((m) => m.type !== "paired").length, 1);
  });

  test("invalid UTF-8 in a text frame closes only that socket", async () => {
    const dash = await dashboard();
    const cam = await phone();
    cam.ws.send(Buffer.from([0xc3, 0x28, 0xff]), { binary: false });
    assert.ok([1006, 1007].includes(await cam.closed));
    dash.ws.send(Buffer.from([0xc3, 0x28]), { binary: false });
    assert.ok([1006, 1007].includes(await dash.closed));
    const again = await phone();
    assert.equal(again.ws.readyState, WebSocket.OPEN);
  });

  test("an oversize frame closes only that phone's socket", async () => {
    const dash = await dashboard();
    const cam = await phone();
    await until(() => dash.texts.some((m) => m.type === "device_online"));
    cam.ws.send(Buffer.alloc(CAMERA_MAX_FRAME_BYTES + 4096), { binary: true });
    // ws closes with 1009; the server's error handler then terminates, so the client may see 1006.
    assert.ok([1006, 1009].includes(await cam.closed));
    await until(() => dash.texts.some((m) => m.type === "device_offline"));
    assert.equal(dash.ws.readyState, WebSocket.OPEN);
    const again = await phone();
    assert.equal(again.ws.readyState, WebSocket.OPEN);
  });

  test("a reconnecting phone replaces the old socket with 4000", async () => {
    const first = await phone();
    await phone();
    assert.equal(await first.closed, 4000);
  });
});

describe("heartbeat", () => {
  test("a socket that stops answering pings is terminated; a live one stays", async () => {
    const live = await dashboard();
    const silent = await phone();
    // Stop reading: the client never sees the pings, so it never pongs.
    (silent.ws as unknown as { _socket: net.Socket })._socket.pause();
    await tick(HEARTBEAT_MS * 4);
    (silent.ws as unknown as { _socket: net.Socket })._socket.resume();
    await silent.closed;
    assert.equal(live.ws.readyState, WebSocket.OPEN);
  });
});
