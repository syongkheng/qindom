import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { route } from "./requestUtils.js";
import { ForbiddenAccessException } from "../exceptions/ForbiddenAccessException.js";

interface Captured {
  status?: number;
  body?: { code: number; status: string; data: unknown };
}

function fakeRes(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: Captured["body"]) {
      captured.body = body;
      return res;
    },
  };
  return res as unknown as Response;
}

function fakeReq(): Request {
  return {
    logContext: {
      requestId: "test",
      currentStage: "controller",
      startTime: 0,
      method: "GET",
      path: "/",
      ip: "127.0.0.1",
      events: [],
      metadata: {},
    },
  } as unknown as Request;
}
const next = () => {};

test("route() sends the handler's cr.ok response", async () => {
  const captured: Captured = {};
  await route("Test.GET /", "fallback", async (_req, cr) => cr.ok({ hello: "world" }))(
    fakeReq(),
    fakeRes(captured),
    next,
  );
  assert.equal(captured.status, 200);
  assert.deepEqual(captured.body, { code: 200, status: "Ok", data: { hello: "world" } });
});

test("route() maps a thrown BaseExceptions to its own status", async () => {
  const captured: Captured = {};
  await route("Test.GET /", "fallback", async () => {
    throw new ForbiddenAccessException();
  })(fakeReq(), fakeRes(captured), next);
  assert.equal(captured.status, new ForbiddenAccessException().httpStatus);
  assert.equal(captured.body?.status, "ForbiddenAccessException");
});

test("route() turns an unexpected error into a 500 with the fallback message", async () => {
  const captured: Captured = {};
  await route("Test.GET /", "Failed to do thing", async () => {
    throw new Error("db exploded");
  })(fakeReq(), fakeRes(captured), next);
  assert.equal(captured.status, 500);
  assert.equal(captured.body?.status, "Ko");
  if (process.env.NODE_ENV !== "prd") assert.equal(captured.body?.data, "Failed to do thing");
});
