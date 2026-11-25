import { test } from "node:test";
import assert from "node:assert/strict";
import { CameraRelay, RelaySocket } from "./Camera.relay.js";
import { CAMERA_CLOSE_REPLACED, CAMERA_CLOSE_UNAUTHORISED, CAMERA_MAX_FRAME_BYTES } from "./Camera.protocol.js";

/** Records what the relay sends. Binary sends complete only when `flush()` is called. */
class FakeSocket implements RelaySocket {
  bufferedAmount = 0;
  texts: any[] = [];
  frames: Buffer[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private callbacks: (() => void)[] = [];

  send(data: Buffer | string, cb?: (err?: Error) => void): void {
    if (typeof data === "string") {
      this.texts.push(JSON.parse(data));
      cb?.();
    } else {
      this.frames.push(data);
      if (cb) this.callbacks.push(() => cb());
    }
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }

  /** Completes the oldest in-flight binary send. */
  flush(): void {
    this.callbacks.shift()?.();
  }

  ofType(type: string) {
    return this.texts.filter((m) => m.type === type);
  }
}

const DEVICE_A = "aaaaaaaa-0000-4000-8000-000000000001";
const DEVICE_B = "bbbbbbbb-0000-4000-8000-000000000002";
const jpeg = (n: number) => Buffer.from([0xff, 0xd8, n]);

function decode(packet: Buffer) {
  const n = packet[0];
  return { deviceId: packet.subarray(1, 1 + n).toString("ascii"), jpeg: packet.subarray(1 + n) };
}

function setup() {
  const relay = new CameraRelay();
  const phoneSocket = new FakeSocket();
  const phone = relay.addPhone(phoneSocket, { deviceId: DEVICE_A, userId: 1, name: "iPhone 13" });
  const dashSocket = new FakeSocket();
  const dash = relay.addDashboard(dashSocket, 1);
  return { relay, phone, phoneSocket, dash, dashSocket };
}

test("frames reach the owner's dashboard tagged with the device id", () => {
  const { relay, phone, dashSocket } = setup();
  relay.onPhoneFrame(phone, jpeg(1));
  assert.equal(dashSocket.frames.length, 1);
  assert.deepEqual(decode(dashSocket.frames[0]), { deviceId: DEVICE_A, jpeg: jpeg(1) });
});

test("frames never reach another user's dashboard", () => {
  const { relay, phone } = setup();
  const other = new FakeSocket();
  relay.addDashboard(other, 2);
  relay.onPhoneFrame(phone, jpeg(1));
  assert.equal(other.frames.length, 0);
});

test("frames from an unpaired phone are discarded", () => {
  const relay = new CameraRelay();
  const phone = relay.addPhone(new FakeSocket(), { deviceId: DEVICE_A, userId: null, name: "x" });
  const dash = new FakeSocket();
  relay.addDashboard(dash, 1);
  relay.onPhoneFrame(phone, jpeg(1));
  assert.equal(dash.frames.length, 0);
});

test("oversized frames are discarded", () => {
  const { relay, phone, dashSocket } = setup();
  relay.onPhoneFrame(phone, Buffer.alloc(CAMERA_MAX_FRAME_BYTES + 1));
  assert.equal(dashSocket.frames.length, 0);
});

test("while a frame is in flight only the latest waits; older ones are dropped", () => {
  const { relay, phone, dashSocket } = setup();
  relay.onPhoneFrame(phone, jpeg(1)); // in flight
  relay.onPhoneFrame(phone, jpeg(2)); // waiting
  relay.onPhoneFrame(phone, jpeg(3)); // replaces 2
  assert.equal(dashSocket.frames.length, 1);

  dashSocket.flush(); // 1 done → 3 goes out
  assert.equal(dashSocket.frames.length, 2);
  assert.deepEqual(decode(dashSocket.frames[1]).jpeg, jpeg(3));

  dashSocket.flush(); // 3 done, nothing waiting
  assert.equal(dashSocket.frames.length, 2);
});

test("a slow dashboard does not hold back a fast one", () => {
  const { relay, phone, dashSocket: slow } = setup();
  const fast = new FakeSocket();
  relay.addDashboard(fast, 1);

  relay.onPhoneFrame(phone, jpeg(1));
  fast.flush();
  relay.onPhoneFrame(phone, jpeg(2));
  fast.flush();
  relay.onPhoneFrame(phone, jpeg(3));

  assert.equal(fast.frames.length, 3);
  assert.equal(slow.frames.length, 1); // still writing frame 1
});

test("dashboards over the buffer limit get no new frames", () => {
  const relay = new CameraRelay(100);
  const phone = relay.addPhone(new FakeSocket(), { deviceId: DEVICE_A, userId: 1, name: "x" });
  const dash = new FakeSocket();
  relay.addDashboard(dash, 1);
  dash.bufferedAmount = 101;
  relay.onPhoneFrame(phone, jpeg(1));
  assert.equal(dash.frames.length, 0);
  dash.bufferedAmount = 0;
  relay.onPhoneFrame(phone, jpeg(2));
  assert.equal(dash.frames.length, 1);
});

test("each device has its own frame slot", () => {
  const { relay, phone, dashSocket } = setup();
  const phoneB = relay.addPhone(new FakeSocket(), { deviceId: DEVICE_B, userId: 1, name: "14 Pro Max" });
  relay.onPhoneFrame(phone, jpeg(1));
  relay.onPhoneFrame(phoneB, jpeg(2)); // A's in-flight frame must not block B
  assert.deepEqual(
    dashSocket.frames.map((f) => decode(f).deviceId),
    [DEVICE_A, DEVICE_B],
  );
});

test("a new dashboard gets online devices with status and the latest frame", () => {
  const { relay, phone } = setup();
  relay.onPhoneText(phone, JSON.stringify({ type: "status", status: { recording: true, quality: "1080p" } }));
  relay.onPhoneFrame(phone, jpeg(7));

  const late = new FakeSocket();
  relay.addDashboard(late, 1);
  const [online] = late.ofType("device_online");
  assert.equal(online.deviceId, DEVICE_A);
  assert.equal(online.status.recording, true);
  assert.equal(online.status.quality, "1080p");
  assert.deepEqual(decode(late.frames[0]).jpeg, jpeg(7));
});

test("status is sanitised and forwarded", () => {
  const { relay, phone, dashSocket } = setup();
  relay.onPhoneText(
    phone,
    JSON.stringify({
      type: "status",
      status: { recording: true, batteryLevel: 0.5, thermalState: "bogus", evil: "<script>" },
    }),
  );
  const [msg] = dashSocket.ofType("status");
  assert.equal(msg.deviceId, DEVICE_A);
  assert.equal(msg.status.batteryLevel, 0.5);
  assert.equal(msg.status.thermalState, "nominal");
  assert.equal("evil" in msg.status, false);
});

test("malformed or oversize text is ignored", () => {
  const { relay, phone, dashSocket } = setup();
  const before = dashSocket.texts.length;
  relay.onPhoneText(phone, "not json");
  relay.onPhoneText(phone, JSON.stringify({ type: "status", status: "x".repeat(10_000) }));
  relay.onPhoneText(phone, JSON.stringify([1, 2]));
  assert.equal(dashSocket.texts.length, before);
});

test("acks are forwarded with the device id and start time", () => {
  const { relay, phone, dashSocket } = setup();
  relay.onPhoneText(
    phone,
    JSON.stringify({ type: "ack", command: "start", requestId: "r1", ok: true, startedAtMs: 123 }),
  );
  const [ack] = dashSocket.ofType("ack");
  assert.deepEqual(ack, {
    type: "ack",
    deviceId: DEVICE_A,
    command: "start",
    requestId: "r1",
    ok: true,
    error: null,
    startedAtMs: 123,
  });
});

test("start all reaches every phone the user owns, and only those", () => {
  const { relay, dash, dashSocket, phoneSocket } = setup();
  const phoneB = new FakeSocket();
  relay.addPhone(phoneB, { deviceId: DEVICE_B, userId: 1, name: "b" });
  const stranger = new FakeSocket();
  relay.addPhone(stranger, { deviceId: "cccccccc-0000-4000-8000-000000000003", userId: 2, name: "c" });

  relay.onDashboardText(dash, JSON.stringify({ type: "start", target: "all", requestId: "r1" }));
  assert.deepEqual(phoneSocket.ofType("start"), [{ type: "start", requestId: "r1" }]);
  assert.deepEqual(phoneB.ofType("start"), [{ type: "start", requestId: "r1" }]);
  assert.equal(stranger.texts.length, 0);

  const [result] = dashSocket.ofType("command_result");
  assert.deepEqual(result.sent.sort(), [DEVICE_A, DEVICE_B].sort());
});

test("commands to another user's device are not delivered", () => {
  const relay = new CameraRelay();
  const theirs = new FakeSocket();
  relay.addPhone(theirs, { deviceId: DEVICE_B, userId: 2, name: "b" });
  const mineSocket = new FakeSocket();
  const mine = relay.addDashboard(mineSocket, 1);

  relay.onDashboardText(mine, JSON.stringify({ type: "stop", target: DEVICE_B, requestId: "r" }));
  assert.equal(theirs.texts.length, 0);
  assert.deepEqual(mineSocket.ofType("command_result")[0].offline, [DEVICE_B]);
});

test("set_quality needs a valid quality and passes it through", () => {
  const { relay, dash, phoneSocket } = setup();
  relay.onDashboardText(dash, JSON.stringify({ type: "set_quality", target: DEVICE_A, quality: "8k" }));
  assert.equal(phoneSocket.ofType("set_quality").length, 0);
  relay.onDashboardText(
    dash,
    JSON.stringify({ type: "set_quality", target: DEVICE_A, quality: "1080p", requestId: "q" }),
  );
  assert.deepEqual(phoneSocket.ofType("set_quality"), [{ type: "set_quality", requestId: "q", quality: "1080p" }]);
});

test("a reconnecting phone replaces its old socket without going offline", () => {
  const { relay, phone, phoneSocket, dashSocket } = setup();
  const fresh = new FakeSocket();
  relay.addPhone(fresh, { deviceId: DEVICE_A, userId: 1, name: "iPhone 13" });
  assert.equal(phoneSocket.closed?.code, CAMERA_CLOSE_REPLACED);

  relay.removePhone(phone); // the old socket's close event arrives late
  assert.equal(relay.isOnline(DEVICE_A), true);
  assert.equal(dashSocket.ofType("device_offline").length, 0);
});

test("a phone disconnecting tells its dashboards", () => {
  const { relay, phone, dashSocket } = setup();
  relay.removePhone(phone);
  assert.equal(relay.isOnline(DEVICE_A), false);
  assert.deepEqual(dashSocket.ofType("device_offline"), [{ type: "device_offline", deviceId: DEVICE_A }]);
});

test("binding a connected phone starts relaying it and notifies the phone", () => {
  const relay = new CameraRelay();
  const phoneSocket = new FakeSocket();
  const phone = relay.addPhone(phoneSocket, { deviceId: DEVICE_A, userId: null, name: "iPhone" });
  const dash = new FakeSocket();
  relay.addDashboard(dash, 1);

  relay.bindDevice(DEVICE_A, 1, "Left camera");
  assert.deepEqual(phoneSocket.ofType("paired"), [{ type: "paired", name: "Left camera" }]);
  assert.equal(dash.ofType("device_online")[0].name, "Left camera");

  relay.onPhoneFrame(phone, jpeg(1));
  assert.equal(dash.frames.length, 1);
});

test("removing a device closes its socket with 4401 and tells dashboards", () => {
  const { relay, phoneSocket, dashSocket } = setup();
  relay.disconnectDevice(DEVICE_A, 1);
  assert.equal(phoneSocket.closed?.code, CAMERA_CLOSE_UNAUTHORISED);
  assert.equal(relay.isOnline(DEVICE_A), false);
  assert.deepEqual(dashSocket.ofType("device_removed"), [{ type: "device_removed", deviceId: DEVICE_A }]);
});

test("closed dashboards receive nothing further", () => {
  const { relay, phone, dash, dashSocket } = setup();
  relay.onPhoneFrame(phone, jpeg(1));
  relay.onPhoneFrame(phone, jpeg(2)); // waiting behind 1
  relay.removeDashboard(dash);
  dashSocket.flush();
  assert.equal(dashSocket.frames.length, 1);
});
