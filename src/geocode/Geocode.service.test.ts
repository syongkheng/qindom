import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GeocodeService } from "./Geocode.service.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const PLACE = { place_id: 1, lat: "1.36", lon: "103.99", display_name: "Changi Airport, Singapore" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeDb(cachedJson?: string) {
  const inserts: { table: string; data: Record<string, unknown> }[] = [];
  const db = {
    async find() {
      return cachedJson ? [{ results_json: cachedJson }] : [];
    },
    async insert(table: string, data: Record<string, unknown>) {
      inserts.push({ table, data });
      return data;
    },
  };
  return { db: db as never, inserts };
}

function stubFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    return { ok: response.ok, status: response.status ?? 200, json: async () => response.body };
  }) as never;
  return calls;
}

test("cache hit returns cached results without calling Nominatim", async () => {
  const { db, inserts } = fakeDb(JSON.stringify([PLACE]));
  const calls = stubFetch({ ok: true, body: [] });
  assert.deepEqual(await new GeocodeService(db).search("Changi"), [PLACE]);
  assert.equal(calls.length, 0);
  assert.equal(inserts.length, 0);
});

test("cache miss fetches from Nominatim (normalised query, limit + addressdetails) and caches", async () => {
  const { db, inserts } = fakeDb();
  const calls = stubFetch({ ok: true, body: [PLACE] });
  assert.deepEqual(await new GeocodeService(db).search("  Changi Airport "), [PLACE]);
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get("q"), "changi airport");
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.get("addressdetails"), "1");
  assert.equal(inserts[0].data.query, "changi airport");
});

test("failed Nominatim fetch throws ExternalRequest and is not cached", async () => {
  const { db, inserts } = fakeDb();
  stubFetch({ ok: false, status: 503 });
  await assert.rejects(new GeocodeService(db).search("nowhere"), Exceptions.ExternalRequest);
  assert.equal(inserts.length, 0);
});
