import { test } from "node:test";
import assert from "node:assert/strict";
import { ProfileService } from "./Profile.service.js";
import { validateCountryBody, validatePhotoBody, validateUsernameBody } from "./Profile.validator.js";
import { verifyToken } from "../token/Token.service.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

process.env.JWT_SECRET = "test-secret";

type Row = Record<string, unknown>;

function fakeDb(rows: Row[]) {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const updates: { where: Row; data: Row }[] = [];
  const db = {
    async findOne(_t: string, where: Row) {
      return rows.find((r) => matches(r, where));
    },
    async update(_t: string, where: Row, data: Row) {
      updates.push({ where, data });
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, data));
      return [];
    },
  };
  return { db: db as never, updates };
}

const alice = () => ({
  id: 1,
  username: "alice",
  username_system: "alice_fnd",
  roles: '["MODULE_R1"]',
  last_logged_in_dt: 5,
  record_status: "A",
});

test("updateUsername writes username, username_system and a fresh token in one update", async () => {
  const { db, updates } = fakeDb([alice()]);
  const result = await new ProfileService(db).updateUsername(1, "alicia", "fnd");

  assert.equal(result.username, "alicia");
  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(updates[0].data).sort(), ["token", "username", "username_system"]);
  assert.equal(updates[0].data.username_system, "alicia_fnd");
  const decoded = verifyToken(result.token);
  assert.equal(decoded.username, "alicia");
  assert.deepEqual(decoded.roles, ["MODULE_R1"]);
});

test("updateUsername rejects a name another active user has (409)", async () => {
  const { db, updates } = fakeDb([alice(), { id: 2, username_system: "bob_fnd", record_status: "A" }]);
  await assert.rejects(new ProfileService(db).updateUsername(1, "bob", "fnd"), Exceptions.UsernameAlreadyTaken);
  assert.equal(updates.length, 0);
});

test("updateCountry returns only the country, never the user row", async () => {
  const { db } = fakeDb([alice()]);
  assert.deepEqual(await new ProfileService(db).updateCountry(1, "Singapore"), { country: "Singapore" });
});

test("getProfilePhoto adds the JPEG data-URL header to legacy raw base64", async () => {
  const { db } = fakeDb([{ ...alice(), pfp_picture_blob: Buffer.from("QUJD") }]);
  assert.deepEqual(await new ProfileService(db).getProfilePhoto(1), { blobString: "data:image/jpeg;base64,QUJD" });
});

test("validators: country (empty → null), photo data URL, username length", () => {
  assert.deepEqual(validateCountryBody({ country: " Japan " }), { country: "Japan" });
  assert.deepEqual(validateCountryBody({ country: "" }), { country: null });
  assert.throws(() => validateCountryBody({ country: "x".repeat(257) }), Exceptions.InvalidRequest);

  assert.ok(validatePhotoBody({ blobString: "data:image/png;base64,iVBORw0KGgo=" }));
  for (const bad of ["hello", "data:text/html;base64,PGI+", 42]) {
    assert.throws(() => validatePhotoBody({ blobString: bad }), Exceptions.InvalidRequest);
  }

  assert.deepEqual(validateUsernameBody({ newUsername: "  bob  " }), { newUsername: "bob" });
  assert.throws(() => validateUsernameBody({ newUsername: "ab" }), Exceptions.InvalidRequest);
  assert.throws(() => validateUsernameBody({ newUsername: "x".repeat(65) }), Exceptions.InvalidRequest);
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

test("U2: country counts code points (256 emoji = the VARCHAR(256) limit); absent is still a 400", () => {
  const emoji = "😀";
  assert.deepEqual(validateCountryBody({ country: emoji.repeat(256) }), { country: emoji.repeat(256) });
  assert.deepEqual(validateCountryBody({ country: "   " }), { country: null });
  assert.deepEqual(
    errorOf(() => validateCountryBody({ country: emoji.repeat(257) })),
    {
      code: "invalid_request_country",
      typeOfError: "format",
    },
  );
  assert.deepEqual(
    errorOf(() => validateCountryBody({})),
    { code: "invalid_request_country", typeOfError: "format" },
  );
  assert.deepEqual(
    errorOf(() => validateCountryBody({ country: null })),
    {
      code: "invalid_request_country",
      typeOfError: "format",
    },
  );
});
