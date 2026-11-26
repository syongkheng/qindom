import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db/mysql.js";
import { DB_PORT, readDbConnection } from "./db/connection.js";
import { createCorsOptions, parseAllowedOrigins } from "./cors.js";
import { BaseException, ForbiddenAccessException } from "../exceptions/AppExceptions.js";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const ROOT_DIR = join(SRC_DIR, "..");
const DB_ENV_KEYS = ["DB_URL", "DB_USER", "DB_PW", "DB_NAME"] as const;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

/** Runs `fn` with the DB env vars replaced (undefined = unset), restoring them afterwards. */
async function withDbEnv(values: Partial<Record<(typeof DB_ENV_KEYS)[number], string>>, fn: () => unknown) {
  const saved = Object.fromEntries(DB_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of DB_ENV_KEYS) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    await fn();
  } finally {
    for (const key of DB_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

describe("env loading", () => {
  test("only config/loadEnv.ts and migrate.ts (plus the root knexfile) load dotenv", () => {
    const loaders = sourceFiles(SRC_DIR)
      .filter((file) => /from "dotenv"/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC_DIR, file))
      .sort();
    assert.deepEqual(loaders, ["config/loadEnv.ts", "migrate.ts"]);
    assert.match(readFileSync(join(ROOT_DIR, "knexfile.ts"), "utf8"), /dotenv\.config\(\);/);
  });

  test("loadEnv is the first import of index.ts and imported nowhere else", () => {
    const index = readFileSync(join(SRC_DIR, "index.ts"), "utf8");
    const firstImport = index.match(/^import .* from "(.+)";$/m);
    assert.equal(firstImport?.[1], "./config/loadEnv.js");
    const importers = sourceFiles(SRC_DIR)
      .filter((file) => readFileSync(file, "utf8").includes("loadEnv.js"))
      .map((file) => relative(SRC_DIR, file));
    assert.deepEqual(importers, ["index.ts"]);
  });

  test("loadEnv: .env in prd, .env.dev otherwise, override + quiet", () => {
    const source = readFileSync(join(SRC_DIR, "config/loadEnv.ts"), "utf8");
    assert.match(source, /IS_PRD \? "\.env" : "\.env\.dev"/);
    assert.match(source, /override: true, quiet: true/);
  });

  test("migrate.ts and knexfile.ts keep targeting .env (plain dotenv.config(), no path, no override)", () => {
    for (const file of [join(SRC_DIR, "migrate.ts"), join(ROOT_DIR, "knexfile.ts")]) {
      const code = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\*\*?|\*|\/\/)/.test(line)) // drop comment lines
        .join("\n");
      assert.match(code, /^dotenv\.config\(\);$/m, file);
      assert.doesNotMatch(code, /\.env\.dev|override|loadEnv/, file);
    }
  });
});

describe("readDbConnection", () => {
  test("maps the DB_* variables, fixed port", async () => {
    await withDbEnv({ DB_URL: "db.test", DB_USER: "u", DB_PW: "p", DB_NAME: "n" }, () => {
      assert.deepEqual(readDbConnection(), { host: "db.test", user: "u", password: "p", database: "n", port: DB_PORT });
    });
    assert.equal(DB_PORT, 3306);
  });

  test("reads on call, not at import", async () => {
    await withDbEnv({ DB_URL: "first" }, () => assert.equal(readDbConnection().host, "first"));
    await withDbEnv({ DB_URL: "second" }, () => assert.equal(readDbConnection().host, "second"));
  });

  test("missing or blank DB_URL throws instead of defaulting to localhost", async () => {
    await withDbEnv({}, () => assert.throws(() => readDbConnection(), /DB_URL is not set/));
    await withDbEnv({ DB_URL: "" }, () => assert.throws(() => readDbConnection(), /DB_URL is not set/));
  });

  test("the app's db never connects without DB_URL (tests load no env file)", async () => {
    await withDbEnv({}, async () => {
      await assert.rejects(db.raw("SELECT 1"), (err: Error) => {
        assert.match(String((err as { cause?: unknown }).cause ?? err.message), /DB_URL is not set/);
        return true;
      });
    });
  });
});

describe("CORS", () => {
  test("parseAllowedOrigins: comma list, trimmed, blanks dropped, unset → []", () => {
    assert.deepEqual(parseAllowedOrigins(" https://a.example , https://b.example,,"), [
      "https://a.example",
      "https://b.example",
    ]);
    assert.deepEqual(parseAllowedOrigins(undefined), []);
    assert.deepEqual(parseAllowedOrigins(""), []);
  });

  function decide(allowed: string[], origin: string | undefined) {
    const { origin: check } = createCorsOptions(allowed);
    assert.equal(typeof check, "function");
    let result: { err: Error | null; allow?: unknown } | undefined;
    (check as (o: string | undefined, cb: (err: Error | null, allow?: unknown) => void) => void)(
      origin,
      (err, allow) => {
        result = { err, allow };
      },
    );
    assert.ok(result, "callback not called synchronously");
    return result;
  }

  test("no Origin and listed origins pass; exact match only", () => {
    assert.deepEqual(decide(["https://a.example"], undefined), { err: null, allow: true });
    assert.deepEqual(decide(["https://a.example"], "https://a.example"), { err: null, allow: true });
    assert.ok(decide(["https://a.example"], "https://a.example.evil")?.err);
    assert.ok(decide(["https://a.example"], "http://a.example")?.err);
  });

  test("a foreign origin is a registry ForbiddenAccess (403)", () => {
    const { err } = decide([], "https://evil.example")!;
    assert.ok(err instanceof BaseException);
    assert.ok(err instanceof ForbiddenAccessException);
    assert.equal(err.httpStatus, 403);
    assert.equal(err.clientMessage, "CORS: origin 'https://evil.example' not allowed");
  });

  test("credentials on, 204 preflight, methods unchanged", () => {
    const options = createCorsOptions([]);
    assert.equal(options.credentials, true);
    assert.equal(options.optionsSuccessStatus, 204);
    assert.equal(options.methods, "GET,POST,DELETE,OPTIONS");
  });
});
