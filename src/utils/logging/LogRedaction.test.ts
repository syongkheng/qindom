import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail, maskEmailsInText, redactForLog, redactTextForLog } from "./LogRedaction.js";
import { LoggingUtilities } from "./LoggingUtilities.js";

test("itinerary access code (challenge) is redacted in objects and free text", () => {
  const out = redactForLog({ shortCode: "abc123", challenge: "123456" }) as Record<string, unknown>;
  assert.notEqual(out.challenge, "123456");
  assert.equal(out.shortCode, "abc123");
  assert.ok(!redactTextForLog('{"challenge":"123456"}').includes("123456"));
});

test("maskEmail keeps the first character and the domain", () => {
  assert.equal(maskEmail("alice@example.com"), "a***@example.com");
  assert.equal(maskEmail("@example.com"), "@example.com");
  assert.equal(maskEmail("no-at-sign"), "no-at-sign");
});

test("maskEmailsInText masks every address in free text and is idempotent", () => {
  const text = "550 rejected: <bob.smith+tag@mail.example.org>, also carol@x.io; where `email` = 'dan@y.co'";
  const masked = maskEmailsInText(text);
  assert.equal(masked, "550 rejected: <b***@mail.example.org>, also c***@x.io; where `email` = 'd***@y.co'");
  assert.equal(maskEmailsInText(masked), masked);
  assert.equal(maskEmailsInText("Server started on port: 3000"), "Server started on port: 3000");
});

test("LoggingUtilities.service lines mask emails in the message (A8)", () => {
  const lines: string[] = [];
  const capture = (line: string) => void lines.push(line);
  const spies = [
    mock.method(console, "log", capture),
    mock.method(console, "warn", capture),
    mock.method(console, "error", capture),
  ];
  try {
    LoggingUtilities.service.info("Svc", "to alice@example.com");
    LoggingUtilities.service.warn("Svc", "to alice@example.com");
    LoggingUtilities.service.debug("Svc", "to alice@example.com");
    LoggingUtilities.service.error("Svc", "Failed to send: 550 alice@example.com unknown");
  } finally {
    spies.forEach((spy) => spy.mock.restore());
  }
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.ok(line.includes("a***@example.com"), line);
    assert.ok(!line.includes("alice@"), line);
  }
  assert.match(lines[0], /\| INFO  \| Svc +\| to a\*\*\*@example\.com$/);
  assert.match(lines[3], /\| ERROR \| Svc/);
});
