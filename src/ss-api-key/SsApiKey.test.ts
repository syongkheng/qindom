import { test } from "node:test";
import assert from "node:assert/strict";
import { SS_KEY_PREFIX, SsApiKeyService } from "./SsApiKey.service.js";
import { validateRenameBody } from "./SsApiKey.validator.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the KnexSqlUtilities calls the service makes. */
function fakeDb(initial: Row[] = []) {
  const rows: Row[] = initial.map((r) => ({ ...r }));
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const db = {
    async findOne(_t: string, where: Row) {
      return rows.find((r) => matches(r, where));
    },
    async insert(_t: string, data: Row) {
      rows.push({ ...data });
      return data;
    },
    async update(_t: string, where: Row, data: Row) {
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, data));
      return 1;
    },
  };
  return { db: db as never, rows };
}

test("generateKey stores only the hash of the returned key and revokes the previous one", async () => {
  const { db, rows } = fakeDb([{ user_id: 7, record_status: "A", api_key_hash: "old" }]);
  const { key } = await new SsApiKeyService(db).generateKey(7);

  assert.match(key, new RegExp(`^${SS_KEY_PREFIX}_[0-9a-f]{64}$`));
  const raw = key.slice(SS_KEY_PREFIX.length + 1);
  const active = rows.filter((r) => r.record_status === "A");
  assert.equal(active.length, 1);
  assert.equal(active[0].api_key_hash, sha256Hex(raw));
  assert.equal(active[0].key_hint, raw.slice(0, 5));
  assert.equal(rows.find((r) => r.api_key_hash === "old")?.record_status, "D");
});

test("getKeyStatus reports no key when none is active", async () => {
  const { db } = fakeDb([{ user_id: 7, record_status: "D" }]);
  assert.deepEqual(await new SsApiKeyService(db).getKeyStatus(7), {
    hasKey: false,
    name: null,
    createdDt: null,
    keyHint: null,
  });
});

test("renameKey without an active key throws NotFound; revokeKey deactivates it", async () => {
  const { db, rows } = fakeDb([{ user_id: 7, record_status: "A", name: "Siri Shortcuts", created_dt: 1 }]);
  const svc = new SsApiKeyService(db);
  assert.deepEqual(await svc.revokeKey(7), { revoked: true });
  assert.equal(rows[0].record_status, "D");
  await assert.rejects(svc.renameKey(7, "Phone"), Exceptions.NotFound);
});

test("validateRenameBody trims, and rejects blank, too long or non-string names", () => {
  assert.deepEqual(validateRenameBody({ name: "  Phone  " }), { name: "Phone" });
  assert.throws(() => validateRenameBody({ name: "   " }), Exceptions.InvalidRequest);
  assert.throws(() => validateRenameBody({ name: "x".repeat(101) }), Exceptions.InvalidRequest);
  assert.throws(() => validateRenameBody({ name: 42 }), Exceptions.InvalidRequest);
});
const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    const e = err as { code: string; typeOfError?: string };
    return { code: e.code, typeOfError: e.typeOfError };
  }
  return null;
};

test("U2: name counts code points (100 emoji = the VARCHAR(100) limit); error codes unchanged", () => {
  const emoji = "😀";
  assert.deepEqual(validateRenameBody({ name: emoji.repeat(100) }), { name: emoji.repeat(100) });
  assert.deepEqual(
    errorOf(() => validateRenameBody({ name: emoji.repeat(101) })),
    {
      code: "invalid_request_name",
      typeOfError: "format",
    },
  );
  assert.deepEqual(
    errorOf(() => validateRenameBody({ name: "  " })),
    {
      code: "invalid_request_name",
      typeOfError: "mandatory",
    },
  );
  assert.deepEqual(
    errorOf(() => validateRenameBody({})),
    { code: "invalid_request_name", typeOfError: "format" },
  );
});
