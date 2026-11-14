import { test } from "node:test";
import assert from "node:assert/strict";
import { PairingCodeStore } from "./Camera.pairing.js";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

test("issues six-digit codes that claim back to the device", () => {
  const store = new PairingCodeStore();
  const { code } = store.issue("device-a");
  assert.match(code, /^\d{6}$/);
  assert.equal(store.claim(code), "device-a");
});

test("codes are single-use", () => {
  const store = new PairingCodeStore();
  const { code } = store.issue("device-a");
  assert.equal(store.claim(code), "device-a");
  assert.equal(store.claim(code), null);
});

test("codes expire after the TTL", () => {
  const c = clock();
  const store = new PairingCodeStore(10 * 60 * 1000, c.now);
  const { code, expiresAt } = store.issue("device-a");
  assert.equal(expiresAt, c.now() + 10 * 60 * 1000);
  c.advance(10 * 60 * 1000);
  assert.equal(store.claim(code), null);
});

test("a code still claims just before expiry", () => {
  const c = clock();
  const store = new PairingCodeStore(10 * 60 * 1000, c.now);
  const { code } = store.issue("device-a");
  c.advance(10 * 60 * 1000 - 1);
  assert.equal(store.claim(code), "device-a");
});

test("re-issuing for a device revokes its previous code", () => {
  const store = new PairingCodeStore();
  const first = store.issue("device-a").code;
  const second = store.issue("device-a").code;
  if (first !== second) assert.equal(store.claim(first), null);
  assert.equal(store.claim(second), "device-a");
  assert.equal(store.size, 0);
});

test("revokeDevice removes the device's code", () => {
  const store = new PairingCodeStore();
  const { code } = store.issue("device-a");
  store.revokeDevice("device-a");
  assert.equal(store.claim(code), null);
});

test("unknown codes claim nothing", () => {
  const store = new PairingCodeStore();
  store.issue("device-a");
  assert.equal(store.claim("not-a-code"), null);
});

test("expired codes are pruned when new ones are issued", () => {
  const c = clock();
  const store = new PairingCodeStore(1000, c.now);
  store.issue("device-a");
  store.issue("device-b");
  c.advance(1000);
  store.issue("device-c");
  assert.equal(store.size, 1);
});

test("live codes are unique across devices", () => {
  const store = new PairingCodeStore();
  const codes = new Set<string>();
  for (let i = 0; i < 2000; i++) codes.add(store.issue(`device-${i}`).code);
  assert.equal(codes.size, 2000);
});
