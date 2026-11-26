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

describe("KnexSqlUtilities batch helpers (insertId / insertMany / updateCountIn)", () => {
  /** Records each statement's builder chain, e.g. `tb_a.where({...}).whereIn(id,[1]).update({...})`. */
  function chainKnex(statements: string[][], result: unknown): Knex {
    const builder = (table: string) => {
      const chain = [table];
      const step =
        (name: string) =>
        (...args: unknown[]) => {
          chain.push(`${name}(${args.map((a) => JSON.stringify(a)).join(",")})`);
          return qb;
        };
      const terminal =
        (name: string) =>
        async (...args: unknown[]) => {
          step(name)(...args);
          statements.push(chain);
          return result;
        };
      const qb: Record<string, unknown> = {
        where: step("where"),
        whereIn: step("whereIn"),
        insert: terminal("insert"),
        update: terminal("update"),
      };
      return qb;
    };
    return builder as unknown as Knex;
  }

  test("insertId: one INSERT, no re-read, returns the new id as a number and logs it", async () => {
    const statements: string[][] = [];
    const db = new KnexSqlUtilities(chainKnex(statements, [42]));
    const ev = event();
    assert.equal(await db.insertId("tb_a", { name: "x" }, ev), 42);
    assert.deepEqual(statements, [["tb_a", 'insert({"name":"x"})']]);
    assert.match(ev.children[0], /^tb_a\.insertId\(\) - \d+ms$/);
  });

  test("insertMany: one multi-row INSERT with every row; an empty list sends nothing", async () => {
    const statements: string[][] = [];
    const db = new KnexSqlUtilities(chainKnex(statements, [7]));
    const ev = event();
    assert.equal(await db.insertMany("tb_b", [{ a: 1 }, { a: 2 }], ev), 2);
    assert.deepEqual(statements, [["tb_b", 'insert([{"a":1},{"a":2}])']]);
    assert.match(ev.children[0], /^tb_b\.insertMany\(2\) - \d+ms$/);
    assert.equal(await db.insertMany("tb_b", [], ev), 0);
    assert.equal(statements.length, 1);
    assert.equal(ev.children.length, 1);
  });

  test("updateCountIn: WHERE scope AND column IN (values) → UPDATE, returns affected; empty list sends nothing", async () => {
    const statements: string[][] = [];
    const db = new KnexSqlUtilities(chainKnex(statements, 3));
    const ev = event();
    const affected = await db.updateCountIn("tb_c", { itinerary_id: 10 }, "id", [1, 2], { record_status: "D" }, ev);
    assert.equal(affected, 3);
    assert.deepEqual(statements, [
      ["tb_c", 'where({"itinerary_id":10})', 'whereIn("id",[1,2])', 'update({"record_status":"D"})'],
    ]);
    assert.match(ev.children[0], /^tb_c\.updateCountIn\(id ×2\) - \d+ms$/);
    assert.equal(await db.updateCountIn("tb_c", { itinerary_id: 10 }, "id", [], { record_status: "D" }, ev), 0);
    assert.equal(statements.length, 1);
  });

  test("a driver error stays a plain Error (500) with the original kept as cause", async () => {
    const driverError = new Error("ER_DUP_ENTRY");
    const failing = (() => ({
      insert: async () => {
        throw driverError;
      },
    })) as unknown as Knex;
    const db = new KnexSqlUtilities(failing);
    for (const run of [() => db.insertId("t", {}), () => db.insertMany("t", [{}])]) {
      await assert.rejects(run(), (err: Error & { cause?: unknown }) => {
        assert.equal(err.message, "Insert failed: ER_DUP_ENTRY");
        assert.equal(err.cause, driverError);
        return true;
      });
    }
  });

  test("real SQL: the helpers' builder chains compile to the statements the raw trx used to send", async () => {
    const knexFactory = (await import("knex")).default;
    const k = knexFactory({ client: "mysql2" });
    assert.equal(
      k("tb_c").where({ itinerary_id: 10 }).whereIn("id", [1, 2]).update({ record_status: "D" }).toString(),
      "update `tb_c` set `record_status` = 'D' where `itinerary_id` = 10 and `id` in (1, 2)",
    );
    assert.equal(
      k("tb_b")
        .insert([{ a: 1 }, { a: 2 }])
        .toString(),
      "insert into `tb_b` (`a`) values (1), (2)",
    );
    await k.destroy();
  });
});
