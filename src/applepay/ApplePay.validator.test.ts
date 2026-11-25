import { test, describe } from "node:test";
import { Exceptions } from "../exceptions/AppExceptions.js";
import assert from "node:assert/strict";
import { validateManualTransactionBody } from "./ApplePay.validator.js";

const validate = validateManualTransactionBody;
// Fixed past timestamp so the "no future dates" rule never depends on wall clock.
const PAST = Date.UTC(2026, 9, 14, 10, 13);

function body(extra: Record<string, unknown> = {}) {
  return { amount: 12.5, merchant: "Kopitiam", occurredDt: PAST, ...extra };
}

describe("validateManualTransactionBody — currency", () => {
  test("defaults to SGD when currency is omitted", () => {
    assert.equal(validate(body()).currency, "SGD");
  });

  test("defaults to SGD for null or empty string", () => {
    assert.equal(validate(body({ currency: null })).currency, "SGD");
    assert.equal(validate(body({ currency: "" })).currency, "SGD");
  });

  test("accepts a 3-letter code as-is", () => {
    assert.equal(validate(body({ currency: "CNY" })).currency, "CNY");
  });

  test("normalises case and surrounding whitespace", () => {
    assert.equal(validate(body({ currency: "usd" })).currency, "USD");
    assert.equal(validate(body({ currency: "  eur " })).currency, "EUR");
  });

  for (const bad of ["US", "USDX", "U5D", "S G", "   ", "€€€"]) {
    test(`rejects malformed currency ${JSON.stringify(bad)}`, () => {
      assert.throws(() => validate(body({ currency: bad })), Exceptions.InvalidRequest);
    });
  }

  test("rejects non-string currency", () => {
    assert.throws(() => validate(body({ currency: 840 })), Exceptions.InvalidRequest);
    assert.throws(() => validate(body({ currency: ["SGD"] })), Exceptions.InvalidRequest);
  });

  test("other fields still returned alongside currency", () => {
    const out = validate(body({ currency: "jpy", merchant: "  Lawson  ", category: "Food", amount: 1.005 }));
    assert.deepEqual(out, {
      amount: 1, // Math.round(1.005*100)/100 under IEEE754
      currency: "JPY",
      merchant: "Lawson",
      occurredDt: PAST,
      category: "Food",
    });
  });
});
