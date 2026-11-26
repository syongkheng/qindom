import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { JWT_TTL_MS, signToken, verifyToken } from "./Token.service.js";

process.env.JWT_SECRET = "test-secret";

const payload = { id: 1, username: "alice", system: "fnd", roles: ["MODULE_R1"], lastLoggedInDt: 123 };

test("signToken() → verifyToken() round-trips the payload with a 30-day expiry", () => {
  const decoded = verifyToken(signToken(payload)) as typeof payload & { iat: number; exp: number };
  assert.deepEqual(
    {
      id: decoded.id,
      username: decoded.username,
      system: decoded.system,
      roles: decoded.roles,
      lastLoggedInDt: decoded.lastLoggedInDt,
    },
    payload,
  );
  assert.equal(decoded.exp - decoded.iat, JWT_TTL_MS / 1000);
});

test("verifyToken() rejects a token signed with another algorithm", () => {
  const hs512 = jwt.sign(payload, "test-secret", { algorithm: "HS512" });
  assert.throws(() => verifyToken(hs512), jwt.JsonWebTokenError);
});

test("verifyToken() rejects an expired token with TokenExpiredError", () => {
  const expired = jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 10 }, "test-secret", {
    algorithm: "HS256",
  });
  assert.throws(() => verifyToken(expired), jwt.TokenExpiredError);
});
