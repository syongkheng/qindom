import { test } from "node:test";
import assert from "node:assert/strict";
import { TodoService } from "./Todo.service.js";
import { validateReorderBody, validateUpdateBody } from "./Todo.validator.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

type Row = Record<string, any>;

/** In-memory stand-in for the KnexSqlUtilities calls TodoService makes (not reorder's raw transaction). */
function fakeDb(rows: Row[] = []) {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const db = {
    async find(_t: string, where: Row, opts: { orderDirection?: string; limit?: number } = {}) {
      const found = rows.filter((r) => matches(r, where)).sort((a, b) => a.sort_order - b.sort_order);
      if (opts.orderDirection === "desc") found.reverse();
      return opts.limit ? found.slice(0, opts.limit) : found;
    },
    async findOne(_t: string, where: Row) {
      return rows.find((r) => matches(r, where));
    },
    async count(_t: string, where: Row) {
      return rows.filter((r) => matches(r, where)).length;
    },
    async insert(_t: string, data: Row) {
      rows.push({ ...data });
      return data;
    },
    async update(_t: string, where: Row, data: Row) {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return hit;
    },
  };
  return { db: db as never, rows };
}

const task = (uuid: string, extra: Row = {}): Row => ({
  uuid,
  title: uuid,
  done: 0,
  done_dt: null,
  pinned: 0,
  sort_order: 1,
  record_status: "A",
  created_dt: 1,
  created_by_id: 7,
  ...extra,
});

test("create appends after the highest sort_order (including deleted tasks)", async () => {
  const { db } = fakeDb([task("a", { sort_order: 4, record_status: "D" })]);
  const created = await new TodoService(db).create(7, "Buy milk");
  assert.equal(created.sortOrder, 5);
  assert.equal(created.done, false);
});

test("completing a pinned task un-pins it and stamps doneAt", async () => {
  const { db } = fakeDb([task("a", { pinned: 1 })]);
  const updated = await new TodoService(db).update(7, "a", { done: true });
  assert.equal(updated.done, true);
  assert.equal(updated.pinned, false);
  assert.equal(typeof updated.doneAt, "number");
});

test("pinning a 4th task is refused with invalid_request_pinned", async () => {
  const { db } = fakeDb([1, 2, 3].map((n) => task(`p${n}`, { pinned: 1 })).concat(task("x")));
  await assert.rejects(
    new TodoService(db).update(7, "x", { pinned: true }),
    (err: InstanceType<typeof Exceptions.InvalidRequest>) => {
      assert.equal(err.code, "invalid_request_pinned");
      assert.equal(err.message, "Limit reached - pinned");
      return true;
    },
  );
});

test("restore drops the pin when the cap was filled since the delete", async () => {
  const pins = [1, 2, 3].map((n) => task(`p${n}`, { pinned: 1 }));
  const { db } = fakeDb([...pins, task("gone", { pinned: 1, record_status: "D" })]);
  const restored = await new TodoService(db).restore(7, "gone");
  assert.equal(restored.pinned, false);
});

test("other users' tasks are not found", async () => {
  const { db } = fakeDb([task("a", { created_by_id: 8 })]);
  await assert.rejects(new TodoService(db).delete(7, "a"), Exceptions.NotFound);
});

test("widget lists open tasks pinned-first, max 3 titles, with the open count", async () => {
  const { db } = fakeDb([
    task("a", { sort_order: 1 }),
    task("b", { sort_order: 2, done: 1 }),
    task("c", { sort_order: 3, pinned: 1 }),
    task("d", { sort_order: 4 }),
    task("e", { sort_order: 5 }),
  ]);
  assert.deepEqual(await new TodoService(db).widget(7), { tasks: ["c", "a", "d"], openCount: 4 });
});

test("validators: update needs a field; reorder needs uuid strings", () => {
  assert.throws(() => validateUpdateBody({}), Exceptions.InvalidRequest);
  assert.throws(() => validateUpdateBody({ done: "yes" }), Exceptions.InvalidRequest);
  assert.deepEqual(validateUpdateBody({ title: " x ", pinned: true }), { title: "x", pinned: true });
  assert.throws(() => validateReorderBody({ ids: [1] }), Exceptions.InvalidRequest);
  assert.deepEqual(validateReorderBody({ ids: [] }), { ids: [] });
});
