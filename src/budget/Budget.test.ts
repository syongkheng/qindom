import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import createBudgetController from "./Budget.controller.js";
import { BudgetService, toBudgetItemDto, toBudgetTableSummaryDto } from "./Budget.service.js";
import {
  validateCollaboratorBody,
  validateItemBody,
  validateItemUpdateBody,
  validateTableBody,
  validateUserIdParam,
} from "./Budget.validator.js";

type Row = Record<string, any>;

const OWNER = 1;
const COLLAB = 2;
const STRANGER = 3;
const FORMER = 4;

/**
 * In-memory stand-in for the KnexSqlUtilities calls BudgetService makes.
 * `raw` only answers the collaborator join; `extraWhere` only supports `whereIn`.
 */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {
    tb_budget_table: [],
    tb_budget_item: [],
    tb_budget_collaborator: [],
    tb_aa_user: [],
    ...structuredClone(seed),
  };
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  let nextId = 1000;
  const db = {
    async find(
      t: string,
      where: Row,
      opts: { orderBy?: string; orderDirection?: string; limit?: number; extraWhere?: (qb: unknown) => void } = {},
    ) {
      let found = tables[t].filter((r) => matches(r, where));
      if (opts.extraWhere) {
        opts.extraWhere({
          whereIn: (col: string, values: unknown[]) => {
            found = found.filter((r) => values.includes(r[col]));
          },
        });
      }
      if (opts.orderBy) {
        const k = opts.orderBy;
        found.sort((a, b) => (a[k] - b[k]) * (opts.orderDirection === "desc" ? -1 : 1));
      }
      return opts.limit ? found.slice(0, opts.limit) : found;
    },
    async findOne(t: string, where: Row) {
      return tables[t].find((r) => matches(r, where));
    },
    async insert(t: string, data: Row) {
      const row = { id: nextId++, ...data };
      tables[t].push(row);
      return row;
    },
    async update(t: string, where: Row, data: Row) {
      const hit = tables[t].filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return hit;
    },
    async raw(_sql: string, [tableId, status]: unknown[]) {
      return tables.tb_budget_collaborator
        .filter((c) => c.table_id === tableId && c.record_status === status)
        .map((c) => {
          const u = tables.tb_aa_user.find((x) => x.id === c.user_id)!;
          return { user_id: c.user_id, username: u.username, email: u.email };
        });
    },
  };
  return { db: db as never, tables };
}

const user = (id: number, extra: Row = {}): Row => ({
  id,
  username: `user${id}`,
  email: `user${id}@example.com`,
  record_status: "A",
  ...extra,
});

const item = (uuid: string, tableId: number, extra: Row = {}): Row => ({
  id: Number.parseInt(uuid.replace(/\D/g, "") || "0", 10) + 500,
  uuid,
  table_id: tableId,
  name: uuid,
  category: null,
  status: "to_buy",
  budget_amount: null,
  actual_amount: null,
  notes: null,
  sort_order: 0,
  created_dt: 1,
  created_by_id: OWNER,
  record_status: "A",
  ...extra,
});

/** Table 10 ("s1") owned by OWNER with COLLAB active and FORMER removed; table 20 ("s2") owned by STRANGER. */
function seed(): Record<string, Row[]> {
  return {
    tb_aa_user: [user(OWNER), user(COLLAB), user(STRANGER), user(FORMER), user(9, { record_status: "D" })],
    tb_budget_table: [
      {
        id: 10,
        session_id: "s1",
        name: "Reno",
        template: "home_reno",
        created_dt: 100,
        created_by_id: OWNER,
        record_status: "A",
      },
      {
        id: 20,
        session_id: "s2",
        name: "Other",
        template: "other",
        created_dt: 200,
        created_by_id: STRANGER,
        record_status: "A",
      },
      {
        id: 30,
        session_id: "s3",
        name: "Gone",
        template: "other",
        created_dt: 300,
        created_by_id: OWNER,
        record_status: "D",
      },
    ],
    tb_budget_item: [
      item("i1", 10, { budget_amount: "100.50", actual_amount: "90.00", sort_order: 0 }),
      item("i2", 10, { budget_amount: "20.00", sort_order: 1 }),
      item("i3", 10, { record_status: "D", sort_order: 5 }),
      item("j1", 20),
    ],
    tb_budget_collaborator: [
      { id: 1, table_id: 10, user_id: COLLAB, added_by_id: OWNER, created_dt: 1, record_status: "A" },
      { id: 2, table_id: 10, user_id: FORMER, added_by_id: OWNER, created_dt: 1, record_status: "D" },
    ],
  };
}

const rejectsWith = (p: Promise<unknown>, code: string, status: number) =>
  assert.rejects(p, (err: { code: string; httpStatus: number }) => {
    assert.equal(err.code, code);
    assert.equal(err.httpStatus, status);
    return true;
  });

// ─── Mappers ──────────────────────────────────────────────────────────────────

describe("mappers", () => {
  test("toBudgetItemDto: uuid as id, DECIMAL strings → numbers, null → omitted", () => {
    const dto = toBudgetItemDto(item("i1", 10, { budget_amount: "12.30", sort_order: 4 }) as never);
    assert.deepEqual(dto, {
      id: "i1",
      name: "i1",
      category: undefined,
      status: "to_buy",
      budgetAmount: 12.3,
      actualAmount: undefined,
      notes: undefined,
      sortOrder: 4,
    });
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(dto))).sort(), [
      "budgetAmount",
      "id",
      "name",
      "sortOrder",
      "status",
    ]);
  });

  test("toBudgetTableSummaryDto sums only the given items, treating null as 0", () => {
    const dto = toBudgetTableSummaryDto(
      seed().tb_budget_table[0] as never,
      [
        { table_id: 10, budget_amount: "1.25", actual_amount: null },
        { table_id: 10, budget_amount: null, actual_amount: "3.00" },
      ] as never,
    );
    assert.deepEqual(dto, {
      sessionId: "s1",
      name: "Reno",
      template: "home_reno",
      createdDt: 100,
      itemCount: 2,
      sumBudget: 1.25,
      sumActual: 3,
    });
  });
});

// ─── Validators ───────────────────────────────────────────────────────────────

describe("validators", () => {
  test("table body: trims name, defaults template, rejects unknown template / blank / >255", () => {
    assert.deepEqual(validateTableBody({ name: "  Reno " }), { name: "Reno", template: "other" });
    assert.deepEqual(validateTableBody({ name: "W", template: "wedding" }), { name: "W", template: "wedding" });
    assert.throws(() => validateTableBody({ name: "W", template: "party" }), { code: "invalid_request_template" });
    assert.throws(() => validateTableBody({ name: "W", template: null }), { code: "invalid_request_template" });
    assert.throws(() => validateTableBody({ name: "   " }), { code: "invalid_request_name" });
    assert.throws(() => validateTableBody({ name: "x".repeat(256) }), { code: "invalid_request_name" });
  });

  test("item body: defaults, blank text → null, column caps, amount range", () => {
    assert.deepEqual(validateItemBody({ name: "Sofa", category: "", notes: "  " }), {
      name: "Sofa",
      category: null,
      status: "to_buy",
      budgetAmount: null,
      actualAmount: null,
      notes: null,
    });
    assert.equal(validateItemBody({ name: "Sofa", budgetAmount: -5.5 }).budgetAmount, -5.5);
    assert.throws(() => validateItemBody({ name: "Sofa", category: "c".repeat(65) }), {
      code: "invalid_request_category",
    });
    assert.throws(() => validateItemBody({ name: "Sofa", notes: "n".repeat(1025) }), { code: "invalid_request_notes" });
    assert.throws(() => validateItemBody({ name: "Sofa", status: "sold" }), { code: "invalid_request_status" });
    assert.throws(() => validateItemBody({ name: "Sofa", budgetAmount: "5" }), {
      code: "invalid_request_budgetAmount",
    });
    assert.throws(() => validateItemBody({ name: "Sofa", actualAmount: 1e10 }), {
      code: "invalid_request_actualAmount",
    });
    // A cleared el-input-number sends null: same as omitting the amount.
    assert.equal(validateItemBody({ name: "Sofa", budgetAmount: null, actualAmount: null }).budgetAmount, null);
  });

  test("item update: only present fields, null clears, empty body refused", () => {
    assert.deepEqual(validateItemUpdateBody({ budgetAmount: null, category: null, notes: "" }), {
      budgetAmount: null,
      category: null,
      notes: null,
    });
    assert.deepEqual(validateItemUpdateBody({ status: "bought" }), { status: "bought" });
    assert.throws(() => validateItemUpdateBody({}), { code: "invalid_request_body" });
    assert.throws(() => validateItemUpdateBody({ name: "" }), { code: "invalid_request_name" });
    assert.throws(() => validateItemUpdateBody({ status: null }), { code: "invalid_request_status" });
  });

  test("collaborator email and userId param", () => {
    assert.deepEqual(validateCollaboratorBody({ email: " a@b.co " }), { email: "a@b.co" });
    assert.throws(() => validateCollaboratorBody({ email: "nope" }), { code: "invalid_request_email" });
    assert.throws(() => validateCollaboratorBody({}), { code: "invalid_request_email" });
    assert.deepEqual(validateUserIdParam({ userId: "7" }), { userId: 7 });
    assert.throws(() => validateUserIdParam({ userId: "abc" }), { code: "invalid_request_userId" });
    assert.throws(() => validateUserIdParam({ userId: "0" }), { code: "invalid_request_userId" });
  });
});

// ─── Service: access control ──────────────────────────────────────────────────

describe("BudgetService access control", () => {
  test("list: owned + shared (active collaboration only), deleted tables hidden, sums per table", async () => {
    const { db } = fakeDb(seed());
    const svc = new BudgetService(db);

    const mine = await svc.listTables(OWNER);
    assert.deepEqual(
      mine.myTables.map((t) => [t.sessionId, t.itemCount, t.sumBudget, t.sumActual]),
      [["s1", 2, 120.5, 90]],
    );
    assert.deepEqual(mine.sharedTables, []);

    const collab = await svc.listTables(COLLAB);
    assert.deepEqual(collab.myTables, []);
    assert.deepEqual(
      collab.sharedTables.map((t) => t.sessionId),
      ["s1"],
    );

    assert.deepEqual(await svc.listTables(FORMER), { myTables: [], sharedTables: [] });
  });

  test("get: owner isOwner=true, collaborator isOwner=false, stranger/removed 403, missing/deleted 404", async () => {
    const { db } = fakeDb(seed());
    const svc = new BudgetService(db);

    const asOwner = await svc.getBySessionId(OWNER, "s1");
    assert.equal(asOwner.isOwner, true);
    assert.deepEqual(
      asOwner.items.map((i) => i.id),
      ["i1", "i2"],
    );
    assert.deepEqual(asOwner.collaborators, [{ userId: COLLAB, username: "user2", email: "user2@example.com" }]);

    assert.equal((await svc.getBySessionId(COLLAB, "s1")).isOwner, false);
    await rejectsWith(svc.getBySessionId(STRANGER, "s1"), "forbidden_access", 403);
    await rejectsWith(svc.getBySessionId(FORMER, "s1"), "forbidden_access", 403);
    await rejectsWith(svc.getBySessionId(OWNER, "s3"), "entity_not_found", 404);
    await rejectsWith(svc.getBySessionId(OWNER, "nope"), "entity_not_found", 404);
  });

  test("rename/delete table: owner only (collaborator 403)", async () => {
    const { db, tables } = fakeDb(seed());
    const svc = new BudgetService(db);
    await rejectsWith(svc.renameTable(COLLAB, "s1", "X"), "forbidden_access", 403);
    await rejectsWith(svc.deleteTable(COLLAB, "s1"), "forbidden_access", 403);

    assert.deepEqual(await svc.renameTable(OWNER, "s1", "New"), { renamed: true });
    assert.equal(tables.tb_budget_table[0].name, "New");

    assert.deepEqual(await svc.deleteTable(OWNER, "s1"), { deleted: true });
    assert.equal(tables.tb_budget_table[0].record_status, "D");
    assert.ok(tables.tb_budget_item.filter((i) => i.table_id === 10).every((i) => i.record_status === "D"));
    assert.equal(tables.tb_budget_item.find((i) => i.uuid === "j1")!.record_status, "A");
  });

  test("items: collaborator can create/edit/delete/restore; stranger 403", async () => {
    const { db, tables } = fakeDb(seed());
    const svc = new BudgetService(db);

    const created = await svc.createItem(COLLAB, "s1", {
      name: "Lamp",
      category: null,
      status: "to_buy",
      budgetAmount: 50,
      actualAmount: null,
      notes: null,
    });
    // Appends after the highest active sort_order (deleted i3 at 5 is ignored, as before).
    assert.equal(created.sortOrder, 2);
    assert.equal(tables.tb_budget_item.at(-1)!.created_by_id, COLLAB);

    const edited = await svc.editItem(COLLAB, "s1", created.id, { status: "bought", actualAmount: 45 });
    assert.equal(edited.status, "bought");
    assert.equal(edited.actualAmount, 45);
    assert.equal(edited.budgetAmount, 50);

    assert.deepEqual(await svc.deleteItem(COLLAB, "s1", created.id), { deleted: true });
    assert.equal((await svc.restoreItem(COLLAB, "s1", created.id)).id, created.id);

    await rejectsWith(svc.editItem(STRANGER, "s1", "i1", { name: "x" }), "forbidden_access", 403);
    await rejectsWith(svc.deleteItem(FORMER, "s1", "i1"), "forbidden_access", 403);
  });

  test("items are scoped to the table in the URL: another table's item is 404 and untouched", async () => {
    const { db, tables } = fakeDb(seed());
    const svc = new BudgetService(db);
    // OWNER has access to s1, but j1 belongs to s2 (STRANGER's).
    await rejectsWith(svc.editItem(OWNER, "s1", "j1", { name: "pwned" }), "entity_not_found", 404);
    await rejectsWith(svc.deleteItem(OWNER, "s1", "j1"), "entity_not_found", 404);
    assert.equal(tables.tb_budget_item.find((i) => i.uuid === "j1")!.name, "j1");
  });

  test("delete needs an active item, restore a deleted one", async () => {
    const { db } = fakeDb(seed());
    const svc = new BudgetService(db);
    await rejectsWith(svc.deleteItem(OWNER, "s1", "i3"), "entity_not_found", 404);
    await rejectsWith(svc.restoreItem(OWNER, "s1", "i1"), "entity_not_found", 404);
    assert.equal((await svc.restoreItem(OWNER, "s1", "i3")).id, "i3");
  });

  test("collaborators: owner only; unknown/deleted user 404; self 400; re-adding reactivates", async () => {
    const { db, tables } = fakeDb(seed());
    const svc = new BudgetService(db);

    await rejectsWith(svc.addCollaborator(COLLAB, "s1", "user3@example.com"), "forbidden_access", 403);
    await rejectsWith(svc.removeCollaborator(COLLAB, "s1", OWNER), "forbidden_access", 403);
    await rejectsWith(svc.addCollaborator(OWNER, "s1", "nobody@example.com"), "entity_not_found", 404);
    await rejectsWith(svc.addCollaborator(OWNER, "s1", "user9@example.com"), "entity_not_found", 404);
    await rejectsWith(svc.addCollaborator(OWNER, "s1", "user1@example.com"), "invalid_request_email", 400);

    const readded = await svc.addCollaborator(OWNER, "s1", "user4@example.com");
    assert.deepEqual(readded, { userId: FORMER, username: "user4", email: "user4@example.com" });
    assert.equal(tables.tb_budget_collaborator.find((c) => c.user_id === FORMER)!.record_status, "A");
    assert.equal(tables.tb_budget_collaborator.length, 2);

    await svc.addCollaborator(OWNER, "s1", "user3@example.com");
    assert.equal(tables.tb_budget_collaborator.length, 3);
    // Adding an already-active collaborator is a no-op.
    await svc.addCollaborator(OWNER, "s1", "user3@example.com");
    assert.equal(tables.tb_budget_collaborator.length, 3);

    assert.deepEqual(await svc.removeCollaborator(OWNER, "s1", COLLAB), { removed: true });
    await rejectsWith(svc.getBySessionId(COLLAB, "s1"), "forbidden_access", 403);
  });

  test("a collaborator's access ends with the table", async () => {
    const { db } = fakeDb(seed());
    const svc = new BudgetService(db);
    await svc.deleteTable(OWNER, "s1");
    await rejectsWith(svc.createItem(COLLAB, "s1", validateItemBody({ name: "x" })), "entity_not_found", 404);
    assert.deepEqual((await svc.listTables(COLLAB)).sharedTables, []);
  });
});

// ─── HTTP (in-process, fake DB) ───────────────────────────────────────────────

describe("HTTP /budget", () => {
  let server: Server;
  let baseUrl: string;
  let tables: Record<string, Row[]>;

  before(async () => {
    const fake = fakeDb(seed());
    tables = fake.tables;
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.logContext = {
        requestId: "test",
        currentStage: "controller",
        startTime: 0,
        method: req.method,
        path: req.path,
        ip: "127.0.0.1",
        events: [],
        metadata: {},
      };
      // Stand-in for mw.auth: the test picks the user with a header.
      const uid = req.header("x-test-user");
      if (uid) req.user = { id: Number(uid), username: `user${uid}`, system: "test", roles: [] };
      next();
    });
    app.use("/budget", createBudgetController(fake.db));
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function call(method: "GET" | "POST", path: string, userId?: number, body?: unknown) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userId) headers["x-test-user"] = String(userId);
    const res = await fetch(`${baseUrl}/budget${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: (text.startsWith("{") ? JSON.parse(text) : text) as any };
  }

  test("no user → 401", async () => {
    const { status, json } = await call("GET", "/");
    assert.equal(status, 401);
    assert.equal(json.data.code, "unauthorized_access");
  });

  test("GET / lists owned and shared tables", async () => {
    const { status, json } = await call("GET", "/", COLLAB);
    assert.equal(status, 200);
    assert.equal(json.status, "Ok");
    assert.deepEqual(json.data.myTables, []);
    assert.deepEqual(Object.keys(json.data.sharedTables[0]).sort(), [
      "createdDt",
      "itemCount",
      "name",
      "sessionId",
      "sumActual",
      "sumBudget",
      "template",
    ]);
  });

  test("POST / creates a table and returns its sessionId", async () => {
    const { status, json } = await call("POST", "/", OWNER, { name: " Trip ", template: "travel" });
    assert.equal(status, 200);
    assert.equal(typeof json.data.sessionId, "string");
    const row = tables.tb_budget_table.find((t) => t.session_id === json.data.sessionId)!;
    assert.equal(row.name, "Trip");
    assert.equal(row.created_by_id, OWNER);
  });

  test("POST / with a bad body → 400 registry shape", async () => {
    const { status, json } = await call("POST", "/", OWNER, { name: "" });
    assert.equal(status, 400);
    assert.equal(json.data.code, "invalid_request_name");
    assert.equal(json.data.fieldName, "name");
  });

  test("GET /:sessionId → table for a collaborator, 403 for a stranger", async () => {
    const ok = await call("GET", "/s1", COLLAB);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.isOwner, false);
    assert.deepEqual(
      ok.json.data.items.map((i: Row) => i.id),
      ["i1", "i2"],
    );
    const denied = await call("GET", "/s1", STRANGER);
    assert.equal(denied.status, 403);
    assert.equal(denied.json.data.code, "forbidden_access");
  });

  test("POST /:sessionId/update → owner renames, collaborator 403", async () => {
    assert.equal((await call("POST", "/s1/update", COLLAB, { name: "X" })).status, 403);
    const { status, json } = await call("POST", "/s1/update", OWNER, { name: "Renamed" });
    assert.equal(status, 200);
    assert.deepEqual(json.data, { renamed: true });
  });

  test("item create → update → delete → restore", async () => {
    const created = await call("POST", "/s1/item", COLLAB, { name: "Rug", budgetAmount: 80 });
    assert.equal(created.status, 200);
    const id = created.json.data.id;
    assert.equal(created.json.data.budgetAmount, 80);

    const updated = await call("POST", `/s1/item/${id}/update`, COLLAB, { budgetAmount: null, notes: "blue" });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.data.budgetAmount, undefined);
    assert.equal(updated.json.data.notes, "blue");

    const empty = await call("POST", `/s1/item/${id}/update`, COLLAB, {});
    assert.equal(empty.status, 400);
    assert.equal(empty.json.data.code, "invalid_request_body");

    assert.deepEqual((await call("POST", `/s1/item/${id}/delete`, COLLAB)).json.data, { deleted: true });
    const restored = await call("POST", `/s1/item/${id}/restore`, COLLAB);
    assert.equal(restored.status, 200);
    assert.equal(restored.json.data.id, id);
  });

  test("old paths are gone and a session id can't shadow the item routes", async () => {
    assert.equal((await call("POST", "/edit/s1", OWNER, { name: "X" })).status, 404);
    assert.equal((await call("POST", "/s1/item/i1", OWNER, { name: "X" })).status, 404);
    // "/:sessionId/update" must not catch "/s1/item": item create still works.
    assert.equal((await call("POST", "/s1/item", OWNER, { name: "Mat", budgetAmount: null })).status, 200);
  });

  test("item of another table → 404", async () => {
    const { status, json } = await call("POST", "/s1/item/j1/delete", OWNER);
    assert.equal(status, 404);
    assert.equal(json.data.code, "entity_not_found");
  });

  test("collaborator add/remove: owner only, bad userId → 400", async () => {
    assert.equal((await call("POST", "/s1/collaborator", COLLAB, { email: "user3@example.com" })).status, 403);
    const added = await call("POST", "/s1/collaborator", OWNER, { email: "user3@example.com" });
    assert.equal(added.status, 200);
    assert.deepEqual(added.json.data, { userId: STRANGER, username: "user3", email: "user3@example.com" });

    assert.equal((await call("POST", "/s1/collaborator/abc/delete", OWNER)).status, 400);
    assert.equal((await call("POST", `/s1/collaborator/${STRANGER}/delete`, COLLAB)).status, 403);
    const removed = await call("POST", `/s1/collaborator/${STRANGER}/delete`, OWNER);
    assert.deepEqual(removed.json.data, { removed: true });
  });

  test("POST /:sessionId/delete → owner deletes; then 404", async () => {
    assert.equal((await call("POST", "/s1/delete", COLLAB)).status, 403);
    assert.deepEqual((await call("POST", "/s1/delete", OWNER)).json.data, { deleted: true });
    assert.equal((await call("GET", "/s1", OWNER)).status, 404);
  });
});

test("unexpected DB failure → 500 with the fallback message", async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.logContext = { requestId: "t", events: [], metadata: {} };
    req.user = { id: OWNER, username: "u", system: "s", roles: [] };
    next();
  });
  const brokenDb = {
    find: async () => {
      throw new Error("db down");
    },
  };
  app.use("/budget", createBudgetController(brokenDb as never));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/budget`);
    assert.equal(res.status, 500);
    assert.match(JSON.stringify(await res.json()), /Failed to load budget tables/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
