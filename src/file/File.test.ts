import { test } from "node:test";
import assert from "node:assert/strict";
import { FileService } from "./File.service.js";
import { validateDeleteBody } from "./File.validator.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

test("deleteByUuids binds statuses + owner and returns the rows actually affected", async () => {
  const calls: { sql: string; bindings: unknown[] }[] = [];
  const db = {
    async raw(sql: string, bindings: unknown[]) {
      calls.push({ sql, bindings });
      return { affectedRows: 1 };
    },
  };
  const result = await new FileService(db as never).deleteByUuids(7, ["a", "b"]);

  assert.deepEqual(result, { deleted: 1 });
  assert.deepEqual(calls[0].bindings, ["D", ["a", "b"], 7, "A"]);
  assert.ok(!/'[AD]'/.test(calls[0].sql), "record_status must be bound, not inlined");
});

test("validateDeleteBody accepts 1–100 non-empty uuid strings", () => {
  assert.deepEqual(validateDeleteBody({ _fileIdsToDelete: ["u1"] }), { _fileIdsToDelete: ["u1"] });
  for (const bad of [undefined, [], "u1", [1], [""], Array(101).fill("u")]) {
    assert.throws(() => validateDeleteBody({ _fileIdsToDelete: bad }), Exceptions.InvalidRequest, String(bad));
  }
});
