import { test } from "node:test";
import assert from "node:assert/strict";
import { isOriginAllowed, normaliseEvent, resolveScreen } from "./AnalyticsContract.js";
import { validateCollectBody } from "./Analytics.validator.js";
import { RegisteredSystem } from "./Analytics.types.js";
import { BaseException } from "../exceptions/AppExceptions.js";
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
  active: true,
};

/** The field a rejected body names (`invalid_request_<field>`, 400). */
function rejectedField(body: unknown): string | undefined {
  try {
    validateCollectBody(body);
    return undefined;
  } catch (err) {
    assert.ok(err instanceof BaseException);
    assert.equal(err.httpStatus, 400);
    return err.fieldName;
  }
}

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
  const r = validateCollectBody(valid);
  assert.equal(r.referrer, "");
  assert.deepEqual(r.properties, {});
});

test("rejects wrong version, bad event names and missing session", () => {
  assert.equal(rejectedField({ ...valid, v: 2 }), "v");
  assert.equal(rejectedField({ ...valid, event: "PageView" }), "event");
  const { sessionId: _s, ...noSession } = valid;
  assert.equal(rejectedField(noSession), "sessionId");
});

test("rejects properties over 4KB", () => {
  assert.equal(rejectedField({ ...valid, properties: { blob: "x".repeat(5000) } }), "properties");
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

test("origin allowlist: empty = open, otherwise exact match; no Origin header passes", () => {
  assert.equal(isOriginAllowed(wedding, "https://evil.example"), true);
  const locked = { ...wedding, allowedOrigins: ["https://jessikheng.com"] };
  assert.equal(isOriginAllowed(locked, "https://jessikheng.com"), true);
  assert.equal(isOriginAllowed(locked, "https://evil.example"), false);
  assert.equal(isOriginAllowed(locked, undefined), true);
});

test("timestamps far from server time are replaced with server time", () => {
  const now = 1_700_000_000_000;
  const parsed = validateCollectBody({ ...valid, timestamp: now - 3 * 24 * 60 * 60 * 1000 });
  assert.equal(normaliseEvent(wedding, parsed, now).timestamp, now);
  const recent = validateCollectBody({ ...valid, timestamp: now - 60_000 });
  assert.equal(normaliseEvent(wedding, recent, now).timestamp, now - 60_000);
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
    [
      { key: "phone", label: "Phone" },
      { key: "desktop", label: "Desktop" },
    ],
    new Map([
      ["unknown", 3],
      ["desktop", 5],
    ]),
    new Map([["desktop", 2]]),
  );
  assert.deepEqual(
    out.map((b) => [b.key, b.views, b.sessions]),
    [
      ["phone", 0, 0],
      ["desktop", 5, 2],
      ["unknown", 3, 0],
    ],
  );
});

test("role allowlist accepts MODULE_R1-5 and legacy 'admin' only", () => {
  for (const r of ["SYSTEM_R5", "TRAVEL_R4", "TRAVEL_R1", "KS_R3", "admin"]) assert.equal(isValidRole(r), true, r);
  for (const r of ["SYSTEM_r5", "SYSTEM_R6", "", "root", 5]) assert.equal(isValidRole(r), false, String(r));
});

test("only SYSTEM_R5 is owner", () => {
  assert.equal(userIsOwner({ roles: ["SYSTEM_R5"] }), true);
  assert.equal(userIsOwner({ roles: ["TRAVEL_R5", "admin"] }), false);
  assert.equal(userIsOwner(undefined), false);
});
