import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { ApplePayService } from "./ApplePay.service.js";
import { validateCardLabelBody, validateCategoryBody } from "./ApplePay.validator.js";
import { getApiKeyUserId } from "../utils/requestUtils.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[]>) {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const db = {
    async find(t: string, where: Row) {
      return (tables[t] ?? []).filter((r) => matches(r, where));
    },
    async findOne(t: string, where: Row) {
      return (tables[t] ?? []).find((r) => matches(r, where));
    },
    async insert(t: string, data: Row) {
      (tables[t] ??= []).push({ ...data });
      return data;
    },
    async update(t: string, where: Row, data: Row) {
      const hit = (tables[t] ?? []).filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return hit;
    },
    async delete(t: string, where: Row) {
      const before = (tables[t] ?? []).length;
      tables[t] = (tables[t] ?? []).filter((r) => !matches(r, where));
      return before - tables[t].length;
    },
  };
  return db as never;
}

const tx = (uuid: string, extra: Row = {}): Row => ({
  uuid,
  amount: "12.50",
  merchant: "Kopitiam",
  occurred_dt: 2,
  created_dt: 2,
  created_by_id: 7,
  record_status: "A",
  ...extra,
});

test("list attaches card labels and defaults currency/source for old rows", async () => {
  const db = fakeDb({
    tb_applepay_transaction: [tx("a", { card_last4: "5244", source: "v2" }), tx("b")],
    tb_applepay_card_label: [{ created_by_id: 7, card_last4: "5244", label: "DBS Debit" }],
  });
  const [a, b] = await new ApplePayService(db).getTransactions(7);
  assert.equal(a.cardLabel, "DBS Debit");
  assert.equal(a.amount, 12.5);
  assert.equal(b.currency, "SGD");
  assert.equal(b.source, "v1");
  assert.equal(b.cardLabel, null);
});

test("delete then restore flips record_status; deleting twice is NotFound", async () => {
  const tables = { tb_applepay_transaction: [tx("a")] };
  const svc = new ApplePayService(fakeDb(tables));
  assert.deepEqual(await svc.deleteTransaction(7, "a"), { id: "a", deleted: true });
  assert.equal(tables.tb_applepay_transaction[0].record_status, "D");
  await assert.rejects(svc.deleteTransaction(7, "a"), Exceptions.NotFound);
  await svc.restoreTransaction(7, "a");
  assert.equal(tables.tb_applepay_transaction[0].record_status, "A");
});

test("another user's transaction can't be re-categorised", async () => {
  const svc = new ApplePayService(fakeDb({ tb_applepay_transaction: [tx("a", { created_by_id: 8 })] }));
  await assert.rejects(svc.updateCategory(7, "a", "Food"), Exceptions.NotFound);
});

test("setCardLabel inserts, updates, then clears", async () => {
  const tables: Record<string, Row[]> = { tb_applepay_card_label: [] };
  const svc = new ApplePayService(fakeDb(tables));
  await svc.setCardLabel(7, "5244", "DBS");
  await svc.setCardLabel(7, "5244", "DBS Debit");
  assert.equal(tables.tb_applepay_card_label.length, 1);
  assert.equal(tables.tb_applepay_card_label[0].label, "DBS Debit");
  assert.deepEqual(await svc.setCardLabel(7, "5244", null), { cardLast4: "5244", label: null });
  assert.equal(tables.tb_applepay_card_label.length, 0);
});

test("category / label validators trim, clear on blank, and cap at 64", () => {
  assert.deepEqual(validateCategoryBody({ category: " Food " }), { category: "Food" });
  assert.deepEqual(validateCategoryBody({ category: "" }), { category: null });
  assert.throws(() => validateCategoryBody({ category: "x".repeat(65) }), Exceptions.InvalidRequest);
  assert.deepEqual(validateCardLabelBody("5244", { label: null }), { cardLast4: "5244", label: null });
  assert.throws(() => validateCardLabelBody("52a4", { label: "x" }), Exceptions.InvalidRequest);
  assert.throws(() => validateCardLabelBody("5244", { label: "x".repeat(65) }), Exceptions.InvalidRequest);
});

test("getApiKeyUserId returns the API-key user or throws 401", () => {
  assert.equal(getApiKeyUserId({ logContext: { metadata: { userId: 42 } } } as unknown as Request), 42);
  assert.throws(
    () => getApiKeyUserId({ logContext: { metadata: {} } } as unknown as Request),
    Exceptions.UnauthorizedAccess,
  );
});
