import { test } from "node:test";
import assert from "node:assert/strict";
import { HouseLayoutService } from "./HouseLayout.service.js";
import { HouseShareService } from "./HouseShare.service.js";
import { validateLayoutBody, validateLayoutUpdateBody } from "./House.validator.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

type Row = Record<string, any>;

function fakeDb(rows: Row[] = []) {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const db = {
    async find(_t: string, where: Row) {
      return rows.filter((r) => matches(r, where));
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

const body = { name: "Flat", dataJson: '{"version":1,"items":[],"custom":[]}', itemCount: 0 };

test("validateLayoutBody stores a normalised envelope and counts items", () => {
  const out = validateLayoutBody({ name: " Flat ", data: { plan: "hdb5", items: [{}, {}], extra: "dropped" } });
  assert.equal(out.name, "Flat");
  assert.equal(out.itemCount, 2);
  assert.deepEqual(JSON.parse(out.dataJson), { version: 1, plan: "hdb5", items: [{}, {}], custom: [] });
});

test("validateLayoutBody rejects bad envelopes, oversized lists and > 1 MB data", () => {
  for (const data of [
    null,
    "x",
    { items: "no" },
    { items: Array(501).fill(0) },
    { items: [], walls: Array(401).fill(0) },
  ]) {
    assert.throws(() => validateLayoutBody({ name: "x", data }), Exceptions.InvalidRequest);
  }
  assert.throws(
    () => validateLayoutBody({ name: "x", data: { items: ["x".repeat(1_000_001)] } }),
    Exceptions.InvalidRequest,
  );
  assert.throws(() => validateLayoutUpdateBody({}), Exceptions.InvalidRequest);
});

test("the 31st layout is refused with invalid_request_layouts", async () => {
  const existing = Array.from({ length: 30 }, (_, i) => ({ uuid: `l${i}`, created_by_id: 7, record_status: "A" }));
  const { db } = fakeDb(existing);
  await assert.rejects(
    new HouseLayoutService(db).create(7, body),
    (err: { code: string }) => err.code === "invalid_request_layouts",
  );
});

test("share view never exposes the owner, and a revoked link is NotFound", async () => {
  const { db } = fakeDb([
    { token: "t1", name: "Flat", data: '{"items":[]}', created_dt: "5", created_by_id: 7, record_status: "A" },
  ]);
  const svc = new HouseShareService(db);
  assert.deepEqual(await svc.view("t1"), { name: "Flat", createdAt: 5, data: { items: [] } });
  await assert.rejects(svc.revoke(8, "t1"), Exceptions.NotFound);
  await svc.revoke(7, "t1");
  await assert.rejects(svc.view("t1"), Exceptions.NotFound);
});
