import { test } from "node:test";
import assert from "node:assert/strict";
import { redactForLog, redactTextForLog } from "./LogRedaction.js";

test("itinerary access code (challenge) is redacted in objects and free text", () => {
  const out = redactForLog({ shortCode: "abc123", challenge: "123456" }) as Record<string, unknown>;
  assert.notEqual(out.challenge, "123456");
  assert.equal(out.shortCode, "abc123");
  assert.ok(!redactTextForLog('{"challenge":"123456"}').includes("123456"));
});
