import { test } from "node:test";
import assert from "node:assert/strict";
import { SuggestionService } from "./Suggestion.service.js";
import {
  validateCountryQuery,
  validateIdParam,
  validateNoteBody,
  validatePackingBody,
} from "./Suggestion.validator.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

test("GETs map rows to camelCase DTOs without bookkeeping columns", async () => {
  const db = {
    async find(table: string) {
      return table === "tb_suggestion_packing"
        ? [
            {
              id: 1,
              trip_type: "beach",
              label: "Sunscreen",
              label_key: null,
              category: "toiletries",
              record_status: "A",
              created_dt: 1,
            },
          ]
        : [
            {
              id: 2,
              country: "Japan",
              title: "Visit Japan Web",
              url: "https://vjw.digital.go.jp",
              category: null,
              mandatory: 1,
              min_days_before_arrival: null,
              max_advance_hours: 72,
              notes: null,
              record_status: "A",
              created_dt: 1,
            },
          ];
    },
  };
  const svc = new SuggestionService(db as never);
  assert.deepEqual(await svc.getAllPacking(), [
    { id: 1, tripType: "beach", label: "Sunscreen", labelKey: null, category: "toiletries" },
  ]);
  const [note] = await svc.getNotesByCountry("japan");
  assert.equal(note.mandatory, true);
  assert.equal(note.maxAdvanceHours, 72);
  assert.ok(!("record_status" in note));
});

test("validatePackingBody trims, nulls blanks and enforces column widths", () => {
  assert.deepEqual(validatePackingBody({ tripType: " beach ", label: "Hat", labelKey: "", category: null }), {
    tripType: "beach",
    label: "Hat",
    labelKey: null,
    category: null,
  });
  assert.throws(() => validatePackingBody({ tripType: "x".repeat(65), label: "Hat" }), Exceptions.InvalidRequest);
});

test("validateNoteBody requires an http(s) url and non-negative whole counts", () => {
  const base = { country: "Japan", title: "VJW", url: "https://vjw.digital.go.jp" };
  assert.equal(validateNoteBody(base).mandatory, false);
  assert.throws(() => validateNoteBody({ ...base, url: "javascript:alert(1)" }), Exceptions.InvalidRequest);
  assert.throws(() => validateNoteBody({ ...base, maxAdvanceHours: -1 }), Exceptions.InvalidRequest);
  assert.throws(() => validateNoteBody({ ...base, minDaysBeforeArrival: 1.5 }), Exceptions.InvalidRequest);
});

test("country query and id param", () => {
  assert.deepEqual(validateCountryQuery({ country: " Japan " }), { country: "Japan" });
  assert.throws(() => validateCountryQuery({ country: "  " }), Exceptions.InvalidRequest);
  assert.deepEqual(validateIdParam({ id: "5" }), { id: 5 });
  assert.throws(() => validateIdParam({ id: "0" }), Exceptions.InvalidRequest);
});
