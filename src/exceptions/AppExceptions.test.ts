import { test } from "node:test";
import assert from "node:assert/strict";
import { BaseException, Exceptions } from "./AppExceptions.js";

test("InvalidRequest builds invalid_request_<field> codes (fndom maps these to messages)", () => {
  const e = new Exceptions.InvalidRequest("email", "format");
  assert.equal(e.code, "invalid_request_email");
  assert.equal(e.message, "Invalid format - email");
  assert.equal(e.httpStatus, 400);
});

test("InvalidRequest without a field uses invalid_request_generic, not invalid_request_undefined", () => {
  assert.equal(new Exceptions.InvalidRequest().code, "invalid_request_generic");
});

test("statuses match their meaning", () => {
  assert.equal(new Exceptions.MaxVerifyAttempts().httpStatus, 429);
  assert.equal(new Exceptions.VerifyCodeExpired().httpStatus, 400);
  assert.equal(new Exceptions.ExternalRequest("x").httpStatus, 502);
  assert.equal(new Exceptions.EntityCreation().httpStatus, 500);
  assert.equal(new Exceptions.EntityUpdate().httpStatus, 500);
});

test("NotFound / Forbidden / Unauthorized accept a custom message", () => {
  assert.equal(new Exceptions.NotFound("No log entries").message, "No log entries");
  assert.equal(new Exceptions.ForbiddenAccess("Insufficient permissions").message, "Insufficient permissions");
  assert.equal(new Exceptions.UnauthorizedAccess("Session expired").message, "Session expired");
});

test("every registry entry is a BaseException whose name is its class name", () => {
  for (const Ctor of Object.values(Exceptions)) {
    const e = new (Ctor as new (arg?: string) => BaseException)("x");
    assert.ok(e instanceof BaseException);
    assert.equal(e.name, Ctor.name);
  }
});

test("every exported BaseException subclass is in the Exceptions registry", async () => {
  const exported = await import("./AppExceptions.js");
  const registered = new Set<unknown>(Object.values(Exceptions));
  const missing = Object.entries(exported)
    .filter(([, value]) => typeof value === "function" && value !== BaseException)
    .filter(([, value]) => (value as { prototype?: unknown }).prototype instanceof BaseException)
    .filter(([, value]) => !registered.has(value))
    .map(([name]) => name);
  assert.deepEqual(missing, [], `Add these to the Exceptions registry: ${missing.join(", ")}`);
});
