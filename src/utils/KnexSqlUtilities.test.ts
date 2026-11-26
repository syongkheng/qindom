import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Knex } from "knex";
import KnexSqlUtilities from "./KnexSqlUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";

type Call = { conn: string; table?: string; op: string; args: unknown[] };

/**
 * Minimal stand-in for a knex instance (or a trx: same shape). Records every terminal call with the
 * connection name, so a test can tell whether a statement ran on the root connection or the trx.
 */
function fakeKnex(conn: string, calls: Call[], opts: { failRaw?: Error; rows?: unknown[] } = {}): Knex {
  const builder = (table: string) => {
    const qb = {
      where: () => qb,
      select: () => qb,
      first: () => qb,
      toQuery: () => `select * from ${table}`,
      async update(data: unknown) {
        calls.push({ conn, table, op: "update", args: [data] });
        return 2;
      },
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        calls.push({ conn, table, op: "select", args: [] });
        return Promise.resolve(opts.rows ?? []).then(resolve, reject);
      },
    };
    return qb;
  };
  const knex = Object.assign(builder, {
    raw(sql: string, bindings: unknown[]) {
      calls.push({ conn, op: "raw", args: [sql, bindings] });
      return {
        toQuery: () => sql,
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          const result = opts.failRaw ? Promise.reject(opts.failRaw) : Promise.resolve([opts.rows ?? []]);
          return result.then(resolve, reject);
        },
      };
    },
    async transaction<T>(cb: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
      calls.push({ conn, op: "begin", args: [] });
      try {
        const out = await cb(fakeKnex("trx", calls, opts) as unknown as Knex.Transaction);
        calls.push({ conn, op: "commit", args: [] });
        return out;
      } catch (err) {
        calls.push({ conn, op: "rollback", args: [] });
        throw err;
      }
    },
  });
  return knex as unknown as Knex;
}

const event = (): IRequestLogEvent => ({ type: "SERVICE", message: "test", children: [], timestamp: 0 });

describe("KnexSqlUtilities.transaction", () => {
  test("a typed exception thrown inside is rethrown unchanged (keeps its 4xx) and rolls back", async () => {
    const calls: Call[] = [];
    const db = new KnexSqlUtilities(fakeKnex("root", calls));
    const forbidden = new Exceptions.ForbiddenAccess("not yours");
    await assert.rejects(
      db.transaction(async () => {
        throw forbidden;
      }),
      (err) => err === forbidden,
    );
    assert.deepEqual(
      calls.map((c) => c.op),
      ["begin", "rollback"],
    );
  });

  test("an unknown error becomes a plain Error (500) that keeps the original as cause", async () => {
    const db = new KnexSqlUtilities(fakeKnex("root", []));
    const boom = new Error("deadlock");
    await assert.rejects(
      db.transaction(async () => {
        throw boom;
      }),
      (err: Error & { cause?: unknown }) => {
        assert.equal(err.constructor, Error);
        assert.equal(err.message, "Transaction failed: deadlock");
        assert.equal(err.cause, boom);
        return true;
      },
    );
  });

  test("the callback's tx helper runs on the trx and logs each statement to the event", async () => {
    const calls: Call[] = [];
    const db = new KnexSqlUtilities(fakeKnex("root", calls));
    const ev = event();
    const result = await db.transaction(async (_trx, tx) => {
      assert.ok(tx instanceof KnexSqlUtilities);
      return tx.updateCount("tb_x", { id: 1 }, { name: "a" }, ev);
    }, ev);
    assert.equal(result, 2);
    assert.deepEqual(
      calls.map((c) => `${c.conn}:${c.op}`),
      ["root:begin", "trx:update", "root:commit"],
    );
    assert.equal(ev.children.length, 2);
    assert.match(ev.children[0], /^tb_x\.updateCount\(\) - \d+ms$/);
    assert.match(ev.children[1], /^transaction\(\) committed - \d+ms$/);
  });

  test("a rollback is recorded on the event", async () => {
    const db = new KnexSqlUtilities(fakeKnex("root", []));
    const ev = event();
    await assert.rejects(
      db.transaction(async () => {
        throw new Exceptions.NotFound("gone");
      }, ev),
    );
    assert.match(ev.children[0], /^transaction\(\) rolled back - \d+ms$/);
  });

  test("the raw trx is still handed out first (existing call sites)", async () => {
    const calls: Call[] = [];
    const db = new KnexSqlUtilities(fakeKnex("root", calls));
    await db.transaction(async (trx) => {
      await trx("tb_y").update({ a: 1 });
    });
    assert.deepEqual(
      calls.map((c) => `${c.conn}:${c.op}:${c.table ?? ""}`),
      ["root:begin:", "trx:update:tb_y", "root:commit:"],
    );
  });
});

describe("KnexSqlUtilities.raw / findOne", () => {
  test("raw failure stays a plain Error (500) with the driver error kept as cause", async () => {
    const driverError = Object.assign(new Error("Unknown column 'x'"), { code: "ER_BAD_FIELD_ERROR" });
    const db = new KnexSqlUtilities(fakeKnex("root", [], { failRaw: driverError }));
    await assert.rejects(db.raw("SELECT x", []), (err: Error & { cause?: unknown }) => {
      assert.equal(err.message, "Raw query failed: Unknown column 'x'");
      assert.equal(err.cause, driverError);
      return true;
    });
  });

  test("raw passes bindings through, returns the rows and logs to the event", async () => {
    const calls: Call[] = [];
    const db = new KnexSqlUtilities(fakeKnex("root", calls, { rows: [{ n: 1 }] }));
    const ev = event();
    const rows = await db.raw<{ n: number }[]>("SELECT ? AS n", [1], ev);
    assert.deepEqual(rows, [{ n: 1 }]);
    assert.deepEqual(calls[0].args, ["SELECT ? AS n", [1]]);
    assert.match(ev.children[0], /^raw\(\) - \d+ms$/);
  });

  test("findOne logs its timing to the event", async () => {
    const db = new KnexSqlUtilities(fakeKnex("root", [], { rows: [{ id: 1 }] }));
    const ev = event();
    await db.findOne("tb_z", { id: 1 }, ["id"], ev);
    assert.match(ev.children[0], /^tb_z\.findOne\(\) - \d+ms$/);
  });
});

describe("transaction + route()", () => {
  test("a NotFound thrown inside a transaction answers 404 with the registry body (was a 500)", async () => {
    const { route } = await import("./RequestUtilities.js");
    const db = new KnexSqlUtilities(fakeKnex("root", []));
    const captured: { status?: number; body?: { status: string; data: { code: string } } } = {};
    const res = {
      status(code: number) {
        captured.status = code;
        return res;
      },
      json(body: typeof captured.body) {
        captured.body = body;
        return res;
      },
    };
    const req = { logContext: { requestId: "t", startTime: 0, method: "POST", path: "/", ip: "", events: [] } };
    await route("Test.POST /", "fallback", async () => {
      await db.transaction(async () => {
        throw new Exceptions.NotFound("Task not found");
      });
    })(req as never, res as never, () => {});
    assert.equal(captured.status, 404);
    assert.equal(captured.body?.data.code, "entity_not_found");
  });
});
