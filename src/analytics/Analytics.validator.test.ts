import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { BaseException } from "../exceptions/AppExceptions.js";
import { validateCollectBody, validateGrantBody, validateSystemBody } from "./Analytics.validator.js";
import { toRegisteredSystem } from "./AnalyticsSystem.service.js";

const storedRow = { system_key: "s", display_name: "S", breakpoints: "[]", allowed_origins: "[]", record_status: "A" };
const subject = {
  collect: validateCollectBody,
  system: validateSystemBody,
  grant: validateGrantBody,
  storedBreakpoints: (raw: string) => toRegisteredSystem({ ...storedRow, breakpoints: raw } as never).breakpoints,
  storedOrigins: (raw: string) => toRegisteredSystem({ ...storedRow, allowed_origins: raw } as never).allowedOrigins,
};

/**
 * Characterisation of the request validation that used to be zod (Nov 2026). Every case was first run
 * against the original zod schemas and must give the identical outcome with the hand-written validators:
 * same accepted values (defaults, trimming, unknown keys stripped) and the same first failing field.
 */
type Outcome = { value: unknown } | { field: string | undefined; type: string | undefined };

function outcome(fn: (input: unknown) => unknown, input: unknown): Outcome {
  try {
    // JSON round trip: compares exactly what would be stored / sent.
    return { value: JSON.parse(JSON.stringify(fn(input))) };
  } catch (err) {
    if (!(err instanceof BaseException)) throw err;
    return { field: err.fieldName, type: err.typeOfError };
  }
}

const fails = (field: string): Outcome => ({ field, type: "format" });
const emoji = (n: number) => "😀".repeat(n);

// ── POST /analytics/collect ───────────────────────────────────────────────────

const base = {
  v: 1,
  system: "jessikheng",
  event: "page_view",
  sessionId: "abc-123",
  timestamp: 1_700_000_000_000,
  page: "/",
  referrer: "https://google.com/",
  screen: { width: 390, height: 844, breakpoint: "phone", size: "small" },
  properties: { visitorId: "v1" },
};
const minimal = { v: 1, system: "fndom", event: "page_view", sessionId: "s" };
const minimalOut = { ...minimal, page: "", referrer: "", properties: {} };

const COLLECT_CASES: [string, unknown, Outcome][] = [
  ["full payload", base, { value: base }],
  ["minimal payload gets defaults", minimal, { value: minimalOut }],
  ["unknown top-level keys are dropped", { ...minimal, extra: 1, user: "x" }, { value: minimalOut }],
  [
    "unknown screen keys are dropped",
    { ...minimal, screen: { width: 1, height: 2, dpr: 3 } },
    { value: { ...minimalOut, screen: { width: 1, height: 2 } } },
  ],
  ["v must be 1", { ...minimal, v: 2 }, fails("v")],
  ["v as string", { ...minimal, v: "1" }, fails("v")],
  ["v missing", { system: "fndom", event: "page_view", sessionId: "s" }, fails("v")],
  ["v true", { ...minimal, v: true }, fails("v")],
  ["system uppercase", { ...minimal, system: "Fndom" }, fails("system")],
  ["system leading dash", { ...minimal, system: "-fndom" }, fails("system")],
  ["system underscore", { ...minimal, system: "a_b" }, fails("system")],
  ["system 64 chars", { ...minimal, system: "a".repeat(64) }, { value: { ...minimalOut, system: "a".repeat(64) } }],
  ["system 65 chars", { ...minimal, system: "a".repeat(65) }, fails("system")],
  ["system empty", { ...minimal, system: "" }, fails("system")],
  ["system number", { ...minimal, system: 5 }, fails("system")],
  ["system trailing newline", { ...minimal, system: "fndom\n" }, fails("system")],
  ["event camelCase", { ...minimal, event: "pageView" }, fails("event")],
  ["event dash", { ...minimal, event: "page-view" }, fails("event")],
  ["event starts with digit", { ...minimal, event: "1abc" }, fails("event")],
  ["event 64 chars", { ...minimal, event: "a".repeat(64) }, { value: { ...minimalOut, event: "a".repeat(64) } }],
  ["event 65 chars", { ...minimal, event: "a".repeat(65) }, fails("event")],
  ["event missing", { v: 1, system: "fndom", sessionId: "s" }, fails("event")],
  ["sessionId empty", { ...minimal, sessionId: "" }, fails("sessionId")],
  ["sessionId 64", { ...minimal, sessionId: "s".repeat(64) }, { value: { ...minimalOut, sessionId: "s".repeat(64) } }],
  ["sessionId 65", { ...minimal, sessionId: "s".repeat(65) }, fails("sessionId")],
  [
    "sessionId 64 emoji (code points)",
    { ...minimal, sessionId: emoji(64) },
    { value: { ...minimalOut, sessionId: emoji(64) } },
  ],
  ["sessionId 65 emoji", { ...minimal, sessionId: emoji(65) }, fails("sessionId")],
  ["sessionId is not trimmed", { ...minimal, sessionId: " s " }, { value: { ...minimalOut, sessionId: " s " } }],
  ["sessionId number", { ...minimal, sessionId: 5 }, fails("sessionId")],
  ["sessionId null", { ...minimal, sessionId: null }, fails("sessionId")],
  ["timestamp 0", { ...minimal, timestamp: 0 }, { value: { ...minimalOut, timestamp: 0 } }],
  ["timestamp -1", { ...minimal, timestamp: -1 }, fails("timestamp")],
  ["timestamp float", { ...minimal, timestamp: 1.5 }, fails("timestamp")],
  ["timestamp string", { ...minimal, timestamp: "1700000000000" }, fails("timestamp")],
  ["timestamp null", { ...minimal, timestamp: null }, fails("timestamp")],
  ["timestamp 2^53", { ...minimal, timestamp: 2 ** 53 }, fails("timestamp")],
  [
    "timestamp max safe",
    { ...minimal, timestamp: Number.MAX_SAFE_INTEGER },
    { value: { ...minimalOut, timestamp: Number.MAX_SAFE_INTEGER } },
  ],
  ["page 512", { ...minimal, page: "p".repeat(512) }, { value: { ...minimalOut, page: "p".repeat(512) } }],
  ["page 513", { ...minimal, page: "p".repeat(513) }, fails("page")],
  ["page 512 emoji", { ...minimal, page: emoji(512) }, { value: { ...minimalOut, page: emoji(512) } }],
  ["page null", { ...minimal, page: null }, fails("page")],
  ["page number", { ...minimal, page: 5 }, fails("page")],
  ["page empty string kept", { ...minimal, page: "" }, { value: minimalOut }],
  ["referrer 513", { ...minimal, referrer: "r".repeat(513) }, fails("referrer")],
  ["referrer null", { ...minimal, referrer: null }, fails("referrer")],
  ["screen null", { ...minimal, screen: null }, fails("screen")],
  ["screen array", { ...minimal, screen: [] }, fails("screen")],
  ["screen string", { ...minimal, screen: "390x844" }, fails("screen")],
  ["screen empty object", { ...minimal, screen: {} }, fails("screen.width")],
  ["screen width negative", { ...minimal, screen: { width: -1, height: 1 } }, fails("screen.width")],
  ["screen width float", { ...minimal, screen: { width: 1.5, height: 1 } }, fails("screen.width")],
  ["screen width string", { ...minimal, screen: { width: "390", height: 1 } }, fails("screen.width")],
  [
    "screen width 100000",
    { ...minimal, screen: { width: 100000, height: 0 } },
    { value: { ...minimalOut, screen: { width: 100000, height: 0 } } },
  ],
  ["screen width 100001", { ...minimal, screen: { width: 100001, height: 1 } }, fails("screen.width")],
  ["screen height missing", { ...minimal, screen: { width: 1 } }, fails("screen.height")],
  ["screen height 100001", { ...minimal, screen: { width: 1, height: 100001 } }, fails("screen.height")],
  [
    "screen breakpoint 32",
    { ...minimal, screen: { width: 1, height: 1, breakpoint: "b".repeat(32) } },
    { value: { ...minimalOut, screen: { width: 1, height: 1, breakpoint: "b".repeat(32) } } },
  ],
  [
    "screen breakpoint 33",
    { ...minimal, screen: { width: 1, height: 1, breakpoint: "b".repeat(33) } },
    fails("screen.breakpoint"),
  ],
  [
    "screen breakpoint null",
    { ...minimal, screen: { width: 1, height: 1, breakpoint: null } },
    fails("screen.breakpoint"),
  ],
  [
    "screen breakpoint number",
    { ...minimal, screen: { width: 1, height: 1, breakpoint: 5 } },
    fails("screen.breakpoint"),
  ],
  [
    "screen size any string up to 16",
    { ...minimal, screen: { width: 1, height: 1, size: "huge" } },
    { value: { ...minimalOut, screen: { width: 1, height: 1, size: "huge" } } },
  ],
  ["screen size 17", { ...minimal, screen: { width: 1, height: 1, size: "s".repeat(17) } }, fails("screen.size")],
  ["screen size null", { ...minimal, screen: { width: 1, height: 1, size: null } }, fails("screen.size")],
  ["properties array", { ...minimal, properties: [] }, fails("properties")],
  ["properties null", { ...minimal, properties: null }, fails("properties")],
  ["properties string", { ...minimal, properties: "x" }, fails("properties")],
  [
    "properties nested values kept",
    { ...minimal, properties: { a: [1, { b: null }], toString: "x", constructor: 1 } },
    { value: { ...minimalOut, properties: { a: [1, { b: null }], toString: "x", constructor: 1 } } },
  ],
  ["properties over 4KB", { ...minimal, properties: { blob: "x".repeat(5000) } }, fails("properties")],
  [
    "properties exactly 4096 bytes",
    { ...minimal, properties: { b: "x".repeat(4096 - 8) } },
    { value: { ...minimalOut, properties: { b: "x".repeat(4096 - 8) } } },
  ],
  ["properties 4097 bytes", { ...minimal, properties: { b: "x".repeat(4096 - 7) } }, fails("properties")],
  ["properties counted in UTF-8 bytes", { ...minimal, properties: { b: "é".repeat(2045) } }, fails("properties")],
  [
    "properties: a __proto__ key is dropped",
    JSON.parse('{"v":1,"system":"fndom","event":"page_view","sessionId":"s","properties":{"__proto__":{"a":1},"b":2}}'),
    { value: { ...minimalOut, properties: { b: 2 } } },
  ],
  [
    "properties: a nested __proto__ key is kept",
    JSON.parse('{"v":1,"system":"fndom","event":"page_view","sessionId":"s","properties":{"a":{"__proto__":{"x":1}}}}'),
    { value: { ...minimalOut, properties: JSON.parse('{"a":{"__proto__":{"x":1}}}') } },
  ],
  ["body null", null, fails("body")],
  ["body undefined", undefined, fails("body")],
  ["body array", [], fails("body")],
  ["body string", "x", fails("body")],
  ["body number", 5, fails("body")],
  ["first failing field in contract order: v before system", { ...minimal, v: 2, system: "BAD" }, fails("v")],
  ["system before event", { ...minimal, system: "BAD", event: "BAD" }, fails("system")],
  ["sessionId before timestamp", { ...minimal, sessionId: "", timestamp: -1 }, fails("sessionId")],
  ["timestamp before page", { ...minimal, timestamp: -1, page: null }, fails("timestamp")],
  ["referrer before screen", { ...minimal, referrer: null, screen: null }, fails("referrer")],
  ["screen.width before screen.height", { ...minimal, screen: { width: -1, height: -1 } }, fails("screen.width")],
  [
    "screen.breakpoint before screen.size",
    { ...minimal, screen: { width: 1, height: 1, breakpoint: 1, size: 1 } },
    fails("screen.breakpoint"),
  ],
  ["screen before properties", { ...minimal, screen: { width: -1, height: 1 }, properties: [] }, fails("screen.width")],
  [
    "oversized properties only reported when everything else is valid",
    { ...minimal, event: "BAD", properties: { blob: "x".repeat(5000) } },
    fails("event"),
  ],
];

// ── POST /analytics/admin/systems ─────────────────────────────────────────────

const bp = (key: string, maxWidth: number | null = 460, extra: Record<string, unknown> = {}) => ({
  key,
  label: key.toUpperCase(),
  maxWidth,
  size: "small",
  ...extra,
});
const sys = {
  key: "my-site",
  displayName: "My Site",
  breakpoints: [bp("sm"), bp("xl", null, { size: "large" })],
  allowedOrigins: ["https://my-site.com", "http://localhost:5173"],
  active: false,
};
const many = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));

const SYSTEM_CASES: [string, unknown, Outcome][] = [
  ["full payload", sys, { value: sys }],
  [
    "defaults: allowedOrigins [] and active true",
    { key: "a", displayName: "A", breakpoints: [bp("sm")] },
    { value: { key: "a", displayName: "A", breakpoints: [bp("sm")], allowedOrigins: [], active: true } },
  ],
  ["displayName is trimmed", { ...sys, displayName: "  My Site \n" }, { value: sys }],
  [
    "unknown keys dropped (fndom posts the whole admin row back)",
    { ...sys, extra: 1, breakpoints: [bp("sm", 460, { extra: 2 }), bp("xl", null, { size: "large" })] },
    { value: sys },
  ],
  ["key uppercase", { ...sys, key: "My-Site" }, fails("key")],
  ["key empty", { ...sys, key: "" }, fails("key")],
  ["key 65", { ...sys, key: "k".repeat(65) }, fails("key")],
  ["key number", { ...sys, key: 1 }, fails("key")],
  ["key missing", { displayName: "x", breakpoints: [bp("sm")] }, fails("key")],
  ["displayName blank", { ...sys, displayName: "   " }, fails("displayName")],
  ["displayName 128", { ...sys, displayName: "d".repeat(128) }, { value: { ...sys, displayName: "d".repeat(128) } }],
  ["displayName 129", { ...sys, displayName: "d".repeat(129) }, fails("displayName")],
  [
    "displayName 128 after trimming",
    { ...sys, displayName: ` ${"d".repeat(128)} ` },
    { value: { ...sys, displayName: "d".repeat(128) } },
  ],
  ["displayName 128 emoji", { ...sys, displayName: emoji(128) }, { value: { ...sys, displayName: emoji(128) } }],
  ["displayName 129 emoji", { ...sys, displayName: emoji(129) }, fails("displayName")],
  ["displayName number", { ...sys, displayName: 1 }, fails("displayName")],
  ["breakpoints missing", { key: "a", displayName: "A" }, fails("breakpoints")],
  ["breakpoints empty", { ...sys, breakpoints: [] }, fails("breakpoints")],
  ["breakpoints object", { ...sys, breakpoints: {} }, fails("breakpoints")],
  ["breakpoints null", { ...sys, breakpoints: null }, fails("breakpoints")],
  [
    "12 breakpoints",
    { ...sys, breakpoints: many(12, (i) => bp(`b${i}`)) },
    { value: { ...sys, breakpoints: many(12, (i) => bp(`b${i}`)) } },
  ],
  ["13 breakpoints", { ...sys, breakpoints: many(13, (i) => bp(`b${i}`)) }, fails("breakpoints")],
  [
    "13 breakpoints, first invalid: the count is reported",
    { ...sys, breakpoints: many(13, () => ({})) },
    fails("breakpoints"),
  ],
  ["breakpoint null", { ...sys, breakpoints: [null] }, fails("breakpoints.0")],
  ["breakpoint array", { ...sys, breakpoints: [[]] }, fails("breakpoints.0")],
  ["breakpoint key with space", { ...sys, breakpoints: [bp("a b")] }, fails("breakpoints.0.key")],
  [
    "breakpoint key 32",
    { ...sys, breakpoints: [bp("K".repeat(32))] },
    { value: { ...sys, breakpoints: [bp("K".repeat(32))] } },
  ],
  ["breakpoint key 33", { ...sys, breakpoints: [bp("K".repeat(33))] }, fails("breakpoints.0.key")],
  ["breakpoint key empty", { ...sys, breakpoints: [bp("")] }, fails("breakpoints.0.key")],
  ["breakpoint label empty", { ...sys, breakpoints: [{ ...bp("sm"), label: "" }] }, fails("breakpoints.0.label")],
  [
    "breakpoint label blank is allowed (not trimmed)",
    { ...sys, breakpoints: [{ ...bp("sm"), label: " " }] },
    { value: { ...sys, breakpoints: [{ ...bp("sm"), label: " " }] } },
  ],
  [
    "breakpoint label 65",
    { ...sys, breakpoints: [{ ...bp("sm"), label: "l".repeat(65) }] },
    fails("breakpoints.0.label"),
  ],
  [
    "breakpoint label 64 emoji",
    { ...sys, breakpoints: [{ ...bp("sm"), label: emoji(64) }] },
    { value: { ...sys, breakpoints: [{ ...bp("sm"), label: emoji(64) }] } },
  ],
  [
    "breakpoint maxWidth missing",
    { ...sys, breakpoints: [{ key: "a", label: "A", size: "small" }] },
    fails("breakpoints.0.maxWidth"),
  ],
  ["breakpoint maxWidth 0", { ...sys, breakpoints: [bp("sm", 0)] }, fails("breakpoints.0.maxWidth")],
  ["breakpoint maxWidth float", { ...sys, breakpoints: [bp("sm", 1.5)] }, fails("breakpoints.0.maxWidth")],
  [
    "breakpoint maxWidth string",
    { ...sys, breakpoints: [{ ...bp("sm"), maxWidth: "460" }] },
    fails("breakpoints.0.maxWidth"),
  ],
  ["breakpoint maxWidth 2^53", { ...sys, breakpoints: [bp("sm", 2 ** 53)] }, fails("breakpoints.0.maxWidth")],
  ["breakpoint size invalid", { ...sys, breakpoints: [bp("sm", 1, { size: "huge" })] }, fails("breakpoints.0.size")],
  [
    "breakpoint size wrong case",
    { ...sys, breakpoints: [bp("sm", 1, { size: "Small" })] },
    fails("breakpoints.0.size"),
  ],
  [
    "second breakpoint invalid",
    { ...sys, breakpoints: [bp("sm"), bp("xl", 1, { size: 1 })] },
    fails("breakpoints.1.size"),
  ],
  [
    "breakpoint key before label",
    { ...sys, breakpoints: [{ key: "", label: "", maxWidth: 0, size: "x" }] },
    fails("breakpoints.0.key"),
  ],
  [
    "breakpoint label before maxWidth",
    { ...sys, breakpoints: [{ key: "a", label: "", maxWidth: 0, size: "x" }] },
    fails("breakpoints.0.label"),
  ],
  ["allowedOrigins null", { ...sys, allowedOrigins: null }, fails("allowedOrigins")],
  ["allowedOrigins string", { ...sys, allowedOrigins: "https://a.com" }, fails("allowedOrigins")],
  [
    "20 origins",
    { ...sys, allowedOrigins: many(20, (i) => `https://a${i}.com`) },
    { value: { ...sys, allowedOrigins: many(20, (i) => `https://a${i}.com`) } },
  ],
  ["21 origins", { ...sys, allowedOrigins: many(21, (i) => `https://a${i}.com`) }, fails("allowedOrigins")],
  [
    "21 invalid origins: the count is reported",
    { ...sys, allowedOrigins: many(21, () => "x") },
    fails("allowedOrigins"),
  ],
  ["origin with trailing slash", { ...sys, allowedOrigins: ["https://a.com/"] }, fails("allowedOrigins.0")],
  ["origin ftp", { ...sys, allowedOrigins: ["ftp://a.com"] }, fails("allowedOrigins.0")],
  ["origin with space", { ...sys, allowedOrigins: ["https://a b"] }, fails("allowedOrigins.0")],
  ["origin number", { ...sys, allowedOrigins: [1] }, fails("allowedOrigins.0")],
  [
    "origin with port",
    { ...sys, allowedOrigins: ["https://a.com:8443"] },
    { value: { ...sys, allowedOrigins: ["https://a.com:8443"] } },
  ],
  ["second origin invalid", { ...sys, allowedOrigins: ["https://a.com", "a.com"] }, fails("allowedOrigins.1")],
  ["active string", { ...sys, active: "true" }, fails("active")],
  ["active null", { ...sys, active: null }, fails("active")],
  ["active 1", { ...sys, active: 1 }, fails("active")],
  ["body null", null, fails("body")],
  ["body undefined", undefined, fails("body")],
  ["body array", [], fails("body")],
  ["key before displayName", { ...sys, key: "BAD", displayName: "" }, fails("key")],
  ["breakpoints before allowedOrigins", { ...sys, breakpoints: [], allowedOrigins: null }, fails("breakpoints")],
  ["allowedOrigins before active", { ...sys, allowedOrigins: ["x"], active: null }, fails("allowedOrigins.0")],
];

// ── POST /analytics/admin/systems/:key/access ─────────────────────────────────

const noUsername: Outcome = { field: "username", type: undefined };
const GRANT_CASES: [string, unknown, Outcome][] = [
  ["username", { username: "bob" }, { value: { username: "bob" } }],
  ["username is trimmed", { username: "  bob \t" }, { value: { username: "bob" } }],
  ["unknown keys dropped", { username: "bob", role: "SYSTEM_R5" }, { value: { username: "bob" } }],
  ["username 128", { username: "u".repeat(128) }, { value: { username: "u".repeat(128) } }],
  ["username 129", { username: "u".repeat(129) }, noUsername],
  ["username 128 emoji", { username: emoji(128) }, { value: { username: emoji(128) } }],
  ["username blank", { username: "   " }, noUsername],
  ["username empty", { username: "" }, noUsername],
  ["username number", { username: 5 }, noUsername],
  ["username missing", {}, noUsername],
  ["body null", null, noUsername],
  ["body array", [], noUsername],
];

// ── tb_analytic_system JSON columns ───────────────────────────────────────────

const STORED_BREAKPOINT_CASES: [string, string, unknown][] = [
  ["valid list", JSON.stringify([bp("sm"), bp("xl", null)]), [bp("sm"), bp("xl", null)]],
  ["unknown keys dropped", JSON.stringify([bp("sm", 1, { extra: 1 })]), [bp("sm", 1)]],
  ["empty list", "[]", []],
  ["more than 12 is fine when stored", JSON.stringify(many(13, (i) => bp(`b${i}`))), many(13, (i) => bp(`b${i}`))],
  ["one bad entry empties the list", JSON.stringify([bp("sm"), bp("bad key")]), []],
  ["not JSON", "not json", []],
  ["a JSON object", '{"key":"sm"}', []],
  ["JSON null", "null", []],
];

const STORED_ORIGIN_CASES: [string, string, unknown][] = [
  ["valid list", '["https://a.com"]', ["https://a.com"]],
  ["any strings (no URL check when stored)", '["not a url", ""]', ["not a url", ""]],
  ["empty list", "[]", []],
  ["a non-string empties the list", '["https://a.com", 1]', []],
  ["not JSON", "", []],
  ["a JSON string", '"https://a.com"', []],
];

describe("analytics request validation (characterised from the old zod schemas)", () => {
  for (const [label, input, expected] of COLLECT_CASES) {
    test(`collect: ${label}`, () => assert.deepEqual(outcome(subject.collect, input), expected));
  }
  for (const [label, input, expected] of SYSTEM_CASES) {
    test(`system: ${label}`, () => assert.deepEqual(outcome(subject.system, input), expected));
  }
  for (const [label, input, expected] of GRANT_CASES) {
    test(`grant: ${label}`, () => assert.deepEqual(outcome(subject.grant, input), expected));
  }
  for (const [label, raw, expected] of STORED_BREAKPOINT_CASES) {
    test(`stored breakpoints: ${label}`, () => assert.deepEqual(subject.storedBreakpoints(raw), expected));
  }
  for (const [label, raw, expected] of STORED_ORIGIN_CASES) {
    test(`stored origins: ${label}`, () => assert.deepEqual(subject.storedOrigins(raw), expected));
  }
});
