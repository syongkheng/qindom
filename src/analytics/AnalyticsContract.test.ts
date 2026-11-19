import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breakpointForWidth,
  isOriginAllowed,
  normaliseEvent,
  parseCollectRequest,
  RegisteredSystem,
  resolveScreen,
} from "./AnalyticsContract.js";
import { hourlyRange, orderBuckets } from "./AnalyticsDashboard.service.js";
import { isValidRole, userIsOwner } from "../auth/Permission.js";

const wedding: RegisteredSystem = {
  key: "jessikheng",
  displayName: "Jessikheng Wedding",
  breakpoints: [
    { key: "phone", label: "Phone", maxWidth: 800, size: "small" },
    { key: "desktop", label: "Desktop", maxWidth: null, size: "large" },
  ],
  allowedOrigins: [],
};

const valid = {
  v: 1,
  system: "jessikheng",
  event: "page_view",
  sessionId: "abc-123",
  timestamp: 1_700_000_000_000,
  page: "/",
  screen: { width: 390, height: 844, breakpoint: "phone", size: "small" },
};

test("accepts the v1 contract and fills defaults", () => {
  const r = parseCollectRequest(valid);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.referrer, "");
    assert.deepEqual(r.value.properties, {});
  }
});

test("rejects wrong version, bad event names and missing session", () => {
  assert.deepEqual(parseCollectRequest({ ...valid, v: 2 }), { ok: false, field: "v" });
  assert.deepEqual(parseCollectRequest({ ...valid, event: "PageView" }), { ok: false, field: "event" });
  const { sessionId: _s, ...noSession } = valid;
  assert.deepEqual(parseCollectRequest(noSession), { ok: false, field: "sessionId" });
});

test("rejects properties over 4KB", () => {
  const r = parseCollectRequest({ ...valid, properties: { blob: "x".repeat(5000) } });
  assert.deepEqual(r, { ok: false, field: "properties" });
});

test("unknown breakpoint is stored as 'unknown' but a valid client size is kept", () => {
  assert.deepEqual(resolveScreen(wedding, { width: 1, height: 1, breakpoint: "tablet", size: "medium" }), {
    breakpoint: "unknown",
    size: "medium",
  });
});

test("size is derived from the breakpoint mapping when missing or invalid", () => {
  assert.deepEqual(resolveScreen(wedding, { width: 1200, height: 900, breakpoint: "desktop" }), {
    breakpoint: "desktop",
    size: "large",
  });
  assert.deepEqual(resolveScreen(wedding, { width: 390, height: 844, breakpoint: "phone", size: "huge" }), {
    breakpoint: "phone",
    size: "small",
  });
  assert.deepEqual(resolveScreen(wedding, undefined), { breakpoint: "unknown", size: "unknown" });
});

test("breakpointForWidth follows the system's own boundaries", () => {
  assert.equal(breakpointForWidth(wedding.breakpoints, 800)?.key, "phone");
  assert.equal(breakpointForWidth(wedding.breakpoints, 801)?.key, "desktop");
});

test("origin allowlist: empty = open, otherwise exact match; no Origin header passes", () => {
  assert.equal(isOriginAllowed(wedding, "https://evil.example"), true);
  const locked = { ...wedding, allowedOrigins: ["https://jessikheng.com"] };
  assert.equal(isOriginAllowed(locked, "https://jessikheng.com"), true);
  assert.equal(isOriginAllowed(locked, "https://evil.example"), false);
  assert.equal(isOriginAllowed(locked, undefined), true);
});

test("timestamps far from server time are replaced with server time", () => {
  const now = 1_700_000_000_000;
  const parsed = parseCollectRequest({ ...valid, timestamp: now - 3 * 24 * 60 * 60 * 1000 });
  assert.ok(parsed.ok);
  if (parsed.ok) assert.equal(normaliseEvent(wedding, parsed.value, now).timestamp, now);
});

test("hourlyRange returns N zero-fillable hour starts ending at the current hour", () => {
  const now = Date.UTC(2026, 10, 19, 10, 30);
  const { from, starts } = hourlyRange(24, now);
  assert.equal(starts.length, 24);
  assert.equal(starts[23], Date.UTC(2026, 10, 19, 10, 0));
  assert.equal(from, Date.UTC(2026, 10, 18, 11, 0));
});

test("orderBuckets keeps registry order, zero-fills, and puts 'unknown' last", () => {
  const out = orderBuckets(
    [{ key: "phone", label: "Phone" }, { key: "desktop", label: "Desktop" }],
    new Map([["unknown", 3], ["desktop", 5]]),
    new Map([["desktop", 2]]),
  );
  assert.deepEqual(out.map((b) => [b.key, b.views, b.sessions]), [
    ["phone", 0, 0],
    ["desktop", 5, 2],
    ["unknown", 3, 0],
  ]);
});

test("role allowlist accepts MODULE_R1-5 and legacy 'admin' only", () => {
  for (const r of ["SYSTEM_R5", "PPHS_R4", "TRAVEL_R1", "KS_R3", "admin"]) assert.equal(isValidRole(r), true, r);
  for (const r of ["SYSTEM_r5", "SYSTEM_R6", "", "root", 5]) assert.equal(isValidRole(r), false, String(r));
});

test("only SYSTEM_R5 is owner", () => {
  assert.equal(userIsOwner({ roles: ["SYSTEM_R5"] }), true);
  assert.equal(userIsOwner({ roles: ["PPHS_R5", "admin"] }), false);
  assert.equal(userIsOwner(undefined), false);
});
