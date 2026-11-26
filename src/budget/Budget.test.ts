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
/** Verified email but the account is soft-deleted, while still holding an active collaborator row on s1. */
const DELETED_COLLAB = 6;
const UNVERIFIED = 7;

/**
 * In-memory stand-in for the KnexSqlUtilities calls BudgetService makes. Honours `columns`;
 * `raw` only answers the active-collaborator join (INNER JOIN on an active user row);
 * `extraWhere` only supports `whereIn`. Every call is recorded in `calls`.
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
  const project = (row: Row, columns?: readonly string[]) =>
    !columns || columns.includes("*") ? { ...row } : Object.fromEntries(columns.map((c) => [c, row[c]]));
  const calls: { op: string; table: string; where?: Row; sql?: string }[] = [];
  let nextId = 1000;
  const db = {
    async find(
      t: string,
      where: Row,
      opts: {
        orderBy?: string;
        orderDirection?: string;
        limit?: number;
        columns?: readonly string[];
        extraWhere?: (qb: unknown) => void;
      } = {},
    ) {
      calls.push({ op: "find", table: t, where });
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
      return (opts.limit ? found.slice(0, opts.limit) : found).map((r) => project(r, opts.columns));
    },
    async findOne(t: string, where: Row, columns?: readonly string[]) {
      calls.push({ op: "findOne", table: t, where });
      const row = tables[t].find((r) => matches(r, where));
      return row ? project(row, columns) : undefined;
    },
    async insert(t: string, data: Row) {
      calls.push({ op: "insert", table: t });
      const row = { id: nextId++, ...data };
      tables[t].push(row);
      return row;
    },
    async update(t: string, where: Row, data: Row) {
      calls.push({ op: "update", table: t, where });
      const hit = tables[t].filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return hit;
    },
    async raw(sql: string, bindings: unknown[]) {
      calls.push({ op: "raw", table: "", sql });
      const [userStatus, collaboratorStatus, ...rest] = bindings;
      const tableId = sql.includes("c.table_id = ?") ? rest.shift() : undefined;
      const userId = sql.includes("c.user_id = ?") ? rest.shift() : undefined;
      return tables.tb_budget_collaborator
        .filter(
          (c) =>
            c.record_status === collaboratorStatus &&
            (tableId === undefined || c.table_id === tableId) &&
            (userId === undefined || c.user_id === userId),
        )
        .flatMap((c) => {
          const u = tables.tb_aa_user.find((x) => x.id === c.user_id && x.record_status === userStatus);
          return u
            ? [{ id: c.id, table_id: c.table_id, user_id: c.user_id, username: u.username, email: u.email }]
            : [];
        });
    },
  };
  return { db: db as never, tables, calls };
}

const user = (id: number, extra: Row = {}): Row => ({
  id,
  username: `user${id}`,
  email: `user${id}@example.com`,
  email_verified: 1,
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

/**
 * Table 10 ("s1") owned by OWNER with COLLAB active, FORMER removed and DELETED_COLLAB active on a
 * soft-deleted account; table 20 ("s2") owned by STRANGER. User 9 is soft-deleted, UNVERIFIED never
 * confirmed their email.
 */
function seed(): Record<string, Row[]> {
  return {
    tb_aa_user: [
      user(OWNER),
      user(COLLAB),
      user(STRANGER),
      user(FORMER),
      user(DELETED_COLLAB, { record_status: "D" }),
      user(UNVERIFIED, { email_verified: 0 }),
      user(9, { record_status: "D" }),
    ],
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
      { id: 3, table_id: 10, user_id: DELETED_COLLAB, added_by_id: OWNER, created_dt: 1, record_status: "A" },
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

  test("collaborators: owner only; no usable account 404; self 400; re-adding reactivates", async () => {
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
    assert.equal(tables.tb_budget_collaborator.length, 3);

    await svc.addCollaborator(OWNER, "s1", "user3@example.com");
    assert.equal(tables.tb_budget_collaborator.length, 4);
    // Adding an already-active collaborator is a no-op.
    await svc.addCollaborator(OWNER, "s1", "user3@example.com");
    assert.equal(tables.tb_budget_collaborator.length, 4);

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

// ─── Service: soft-deleted users, invite anti-enumeration, leaving ────────────

describe("BudgetService: soft-deleted = gone (B4)", () => {
  test("a soft-deleted collaborator is hidden from the list and loses all access", async () => {
    const { db } = fakeDb(seed());
    const svc = new BudgetService(db);

    const asOwner = await svc.getBySessionId(OWNER, "s1");
    assert.deepEqual(
      asOwner.collaborators.map((c) => c.userId),
      [COLLAB],
    );

    await rejectsWith(svc.getBySessionId(DELETED_COLLAB, "s1"), "forbidden_access", 403);
    await rejectsWith(svc.createItem(DELETED_COLLAB, "s1", validateItemBody({ name: "x" })), "forbidden_access", 403);
    await rejectsWith(svc.editItem(DELETED_COLLAB, "s1", "i1", { name: "x" }), "forbidden_access", 403);
    await rejectsWith(svc.deleteItem(DELETED_COLLAB, "s1", "i1"), "forbidden_access", 403);
    await rejectsWith(svc.restoreItem(DELETED_COLLAB, "s1", "i3"), "forbidden_access", 403);
    assert.deepEqual(await svc.listTables(DELETED_COLLAB), { myTables: [], sharedTables: [] });
    await rejectsWith(svc.leaveTable(DELETED_COLLAB, "s1"), "entity_not_found", 404);
  });

  test("every collaborator query joins on an active user row", async () => {
    const { db, calls } = fakeDb(seed());
    const svc = new BudgetService(db);
    await svc.listTables(COLLAB);
    await svc.getBySessionId(COLLAB, "s1");
    const raws = calls.filter((c) => c.op === "raw");
    assert.ok(raws.length >= 3);
    for (const call of raws)
      assert.match(call.sql!, /JOIN tb_aa_user u ON u\.id = c\.user_id AND u\.record_status = \?/);
    // No collaborator lookup bypasses the join.
    assert.ok(!calls.some((c) => c.table === "tb_budget_collaborator" && (c.op === "find" || c.op === "findOne")));
  });
});

describe("BudgetService.addCollaborator: one answer for every unusable account (B1/B2)", () => {
  const NO_ACCOUNT = { code: "entity_not_found", httpStatus: 404, message: "No account available for that email" };

  async function attempt(email: string) {
    const { db, calls, tables } = fakeDb(seed());
    const err = await new BudgetService(db).addCollaborator(OWNER, "s1", email).then(
      () => assert.fail("expected a rejection"),
      (e: { code: string; httpStatus: number; message: string }) => e,
    );
    return {
      error: { code: err.code, httpStatus: err.httpStatus, message: err.message },
      path: calls.map((c) => `${c.op} ${c.table} ${Object.keys(c.where ?? {}).join(",")}`),
      collaborators: tables.tb_budget_collaborator.length,
    };
  }

  test("unknown, unverified and soft-deleted emails: same error, same queries, nothing written", async () => {
    const unknown = await attempt("nobody@example.com");
    const unverified = await attempt(`user${UNVERIFIED}@example.com`);
    const deleted = await attempt("user9@example.com");
    const deletedCollaborator = await attempt(`user${DELETED_COLLAB}@example.com`);

    for (const result of [unknown, unverified, deleted, deletedCollaborator]) {
      assert.deepEqual(result.error, NO_ACCOUNT);
      assert.deepEqual(result.path, unknown.path);
      assert.equal(result.collaborators, 3);
    }
    // One user lookup carrying every condition, so the three cases can't branch apart.
    assert.deepEqual(
      unknown.path.filter((p) => p.includes("tb_aa_user")),
      ["findOne tb_aa_user email,email_verified,record_status"],
    );
  });

  test("the lookup requires a verified, active account", async () => {
    const { db, calls } = fakeDb(seed());
    await new BudgetService(db).addCollaborator(OWNER, "s1", "user3@example.com");
    const lookup = calls.find((c) => c.table === "tb_aa_user")!;
    assert.deepEqual(lookup.where, { email: "user3@example.com", email_verified: 1, record_status: "A" });
  });

  test("inviting yourself stays its own 400", async () => {
    const { db } = fakeDb(seed());
    await rejectsWith(
      new BudgetService(db).addCollaborator(OWNER, "s1", "user1@example.com"),
      "invalid_request_email",
      400,
    );
  });
});

describe("BudgetService.leaveTable (B5)", () => {
  test("a collaborator leaves: own row soft-deleted, access and listing gone; re-invite reactivates", async () => {
    const { db, tables } = fakeDb(seed());
    const svc = new BudgetService(db);

    assert.deepEqual(await svc.leaveTable(COLLAB, "s1"), { left: true });
    assert.equal(tables.tb_budget_collaborator.find((c) => c.user_id === COLLAB)!.record_status, "D");
    // Nobody else's row is touched.
    assert.equal(tables.tb_budget_collaborator.find((c) => c.user_id === DELETED_COLLAB)!.record_status, "A");
    await rejectsWith(svc.getBySessionId(COLLAB, "s1"), "forbidden_access", 403);
    assert.deepEqual((await svc.listTables(COLLAB)).sharedTables, []);
    assert.deepEqual((await svc.getBySessionId(OWNER, "s1")).collaborators, []);
    // Leaving twice: no longer a member.
    await rejectsWith(svc.leaveTable(COLLAB, "s1"), "entity_not_found", 404);

    await svc.addCollaborator(OWNER, "s1", "user2@example.com");
    assert.equal((await svc.getBySessionId(COLLAB, "s1")).isOwner, false);
  });

  test("owner → 403 with its own message; non-member / removed / missing table → 404", async () => {
    const { db, tables } = fakeDb(seed());
    const svc = new BudgetService(db);
    await assert.rejects(svc.leaveTable(OWNER, "s1"), {
      code: "forbidden_access",
      httpStatus: 403,
      message: "The owner can't leave their own table",
    });
    await rejectsWith(svc.leaveTable(STRANGER, "s1"), "entity_not_found", 404);
    await rejectsWith(svc.leaveTable(FORMER, "s1"), "entity_not_found", 404);
    await rejectsWith(svc.leaveTable(COLLAB, "s3"), "entity_not_found", 404);
    await rejectsWith(svc.leaveTable(COLLAB, "nope"), "entity_not_found", 404);
    assert.ok(tables.tb_budget_collaborator.filter((c) => c.user_id === COLLAB).every((c) => c.record_status === "A"));
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

  test("invite: unknown / unverified / soft-deleted emails get an identical 404 body", async () => {
    const bodies = [];
    for (const email of ["nobody@example.com", `user${UNVERIFIED}@example.com`, "user9@example.com"]) {
      const { status, json } = await call("POST", "/s1/collaborator", OWNER, { email });
      assert.equal(status, 404, email);
      // Everything but the timestamp must be byte-for-byte the same.
      const { timestamp, ...rest } = json.data;
      assert.equal(typeof timestamp, "number");
      bodies.push({ code: json.code, status: json.status, data: rest });
    }
    assert.deepEqual(bodies[0].data, { code: "entity_not_found", message: "No account available for that email" });
    assert.deepEqual(bodies[1], bodies[0]);
    assert.deepEqual(bodies[2], bodies[0]);
    const self = await call("POST", "/s1/collaborator", OWNER, { email: "user1@example.com" });
    assert.equal(self.status, 400);
    assert.equal(self.json.data.code, "invalid_request_email");
  });

  test("POST /:sessionId/leave: 401 / owner 403 / stranger 404 / collaborator 200, then no access", async () => {
    assert.equal((await call("POST", "/s1/leave")).status, 401);

    const owner = await call("POST", "/s1/leave", OWNER);
    assert.equal(owner.status, 403);
    assert.equal(owner.json.data.code, "forbidden_access");
    assert.equal(owner.json.data.message, "The owner can't leave their own table");

    const stranger = await call("POST", "/s1/leave", STRANGER);
    assert.equal(stranger.status, 404);
    assert.equal(stranger.json.data.code, "entity_not_found");
    assert.equal((await call("POST", "/nope/leave", COLLAB)).status, 404);

    const left = await call("POST", "/s1/leave", COLLAB);
    assert.equal(left.status, 200);
    assert.deepEqual(left.json, { code: 200, status: "Ok", data: { left: true } });
    assert.equal((await call("GET", "/s1", COLLAB)).status, 403);
    assert.deepEqual((await call("GET", "/", COLLAB)).json.data.sharedTables, []);
    assert.deepEqual((await call("GET", "/s1", OWNER)).json.data.collaborators, []);
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
