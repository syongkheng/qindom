import { after, afterEach, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { RequestHandler } from "express";
import cookieParser from "cookie-parser";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { Roles } from "../auth/Permission.js";
import { signToken } from "../token/Token.service.js";
import tokenFilterDb from "../config/db/mysql.js";
import createHdbController from "./Hdb.controller.js";
import { HdbService, currentPphsBatch, toNearbyBusStopDto, toNearestMrtStationDto } from "./Hdb.service.js";
import { HdbCoordinateService, googleMapsUrl, toBuildingKey } from "./HdbCoordinate.service.js";
import { extractPphsTableHtml, parsePphsPage, parsePphsTable } from "./HdbPphs.parser.js";
import {
  DEFAULT_MRT_STATION_LIMIT,
  MAX_MRT_STATION_LIMIT,
  NEARBY_BUS_STOPS_MAX_RADIUS_M,
  validateAddressBody,
  validateCoordinatesUpdateBody,
  validateNearbyBusStopsQuery,
  validateNearestMrtStationsQuery,
  validatePphsListQuery,
} from "./Hdb.validator.js";

type Row = Record<string, any>;

// ── Fixtures ──

const FOUR_ROOM_TABLE = `<table><tbody>
  <tr><td>Town</td><td>Address</td><td colspan="3">Flat type</td><td>Expiry</td></tr>
  <tr><td>2-room</td><td>3-room</td><td>4-room</td></tr>
  <tr><td rowspan="2">Bukit Merah</td><td> Blk 1 Jalan Bukit Merah </td><td>12</td><td>-</td><td>3</td><td>Dec 2027</td></tr>
  <tr><td>Blk 2 Jalan Bukit Merah</td><td>-</td><td>5</td><td>-</td><td>Jan 2028</td></tr>
  <tr><td>Tampines</td><td>Blk 36, 43 &amp; 44 Tampines St 1</td><td>1</td><td>2</td><td>3</td><td>Feb 2028</td></tr>
  <tr><td>too short</td></tr>
</tbody></table>`;

const THREE_COLUMN_TABLE = `<table><tbody>
  <tr><td>Town</td><td>Address</td><td colspan="2">Flat type</td><td>Expiry</td></tr>
  <tr><td>2-room</td><td>3-room</td></tr>
  <tr><td>Queenstown</td><td>Blk 9 Dawson Rd</td><td>4</td><td>-</td><td>Mar 2028</td></tr>
  <tr><td>Blk 10 Dawson Rd</td><td>-</td><td>7</td><td>Apr 2028</td></tr>
</tbody></table>`;

function hdbPage(tableHtml: string | null): string {
  const accordionItems = [{ bodyContentVal: "<p>intro</p>" }];
  if (tableHtml) accordionItems.push({ bodyContentVal: tableHtml });
  const nextData = { props: { pageProps: { componentProps: { a: { props: {} }, b: { props: { accordionItems } } } } } };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

/** In-memory stand-in for the KnexSqlUtilities calls hdb (and LtaService.raw) make. */
function fakeDb(rows: Record<string, Row[]> = {}, rawRows: unknown[] = []) {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const table = (t: string) => (rows[t] ??= []);
  const calls = { raw: [] as { sql: string; bindings: unknown[] }[], inserts: [] as { table: string; data: Row }[] };
  const db = {
    async find(t: string, where: Row, opts: { orderDirection?: string; limit?: number } = {}) {
      const found = table(t)
        .filter((r) => matches(r, where))
        .sort((a, b) => a.created_dt - b.created_dt);
      if (opts.orderDirection === "desc") found.reverse();
      return opts.limit ? found.slice(0, opts.limit) : found;
    },
    async findOne(t: string, where: Row) {
      return table(t).find((r) => matches(r, where));
    },
    async insert(t: string, data: Row) {
      calls.inserts.push({ table: t, data });
      table(t).push({ ...data });
      return data;
    },
    async update(t: string, where: Row, data: Row) {
      const hit = table(t).filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return hit;
    },
    async delete(t: string, where: Row) {
      const before = table(t).length;
      rows[t] = table(t).filter((r) => !matches(r, where));
      return before - rows[t].length;
    },
    async raw(sql: string, bindings: unknown[]) {
      calls.raw.push({ sql, bindings });
      return rawRows;
    },
  };
  return { db: db as never, rows, calls };
}

// Every outbound call is stubbed: nothing reaches HDB, OneMap or Nominatim.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type StubResponse = { ok: boolean; status?: number; json?: unknown; text?: string };
function stubFetch(byHost: Record<string, StubResponse | (() => never)>) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (new URL(url).hostname === "127.0.0.1") return realFetch(input, init); // the test's own server
    urls.push(url);
    const stub = byHost[new URL(url).host];
    if (!stub) throw new Error(`unexpected fetch ${url}`);
    if (typeof stub === "function") stub();
    const r = stub as StubResponse;
    return { ok: r.ok, status: r.status ?? 200, json: async () => r.json, text: async () => r.text ?? "" };
  }) as never;
  return urls;
}

const ONEMAP_HOST = "www.onemap.gov.sg";
const NOMINATIM_HOST = "nominatim.openstreetmap.org";
const HDB_HOST = "www.hdb.gov.sg";
const ONEMAP_HIT = { ok: true, json: { found: 1, results: [{ LATITUDE: "1.2851", LONGITUDE: "103.8198" }] } };
const ONEMAP_MISS = { ok: true, json: { found: 0, results: [] } };

const coordinateRow = (address: string, lat: string, lng: string, extra: Row = {}): Row => ({
  building: toBuildingKey(address),
  lat,
  lng,
  formed_url: lat ? googleMapsUrl(lat, lng) : "",
  created_dt: 1,
  created_by: "SYSTEM",
  ...extra,
});

// ── Parser ──

test("parsePphsTable reads town rowspans, the 4-room column and skips '-' and short rows", () => {
  assert.deepEqual(parsePphsTable(FOUR_ROOM_TABLE), [
    {
      town: "Bukit Merah",
      address: "Blk 1 Jalan Bukit Merah",
      flatTypes: { "2-room": "12", "4-room": "3" },
      siteExpiry: "Dec 2027",
    },
    { town: "Bukit Merah", address: "Blk 2 Jalan Bukit Merah", flatTypes: { "3-room": "5" }, siteExpiry: "Jan 2028" },
    {
      town: "Tampines",
      address: "Blk 36, 43 & 44 Tampines St 1",
      flatTypes: { "2-room": "1", "3-room": "2", "4-room": "3" },
      siteExpiry: "Feb 2028",
    },
  ]);
});

test("parsePphsTable handles batches without a 4-room column", () => {
  assert.deepEqual(parsePphsTable(THREE_COLUMN_TABLE), [
    { town: "Queenstown", address: "Blk 9 Dawson Rd", flatTypes: { "2-room": "4" }, siteExpiry: "Mar 2028" },
    { town: "Queenstown", address: "Blk 10 Dawson Rd", flatTypes: { "3-room": "7" }, siteExpiry: "Apr 2028" },
  ]);
});

test("parsePphsPage finds the table inside __NEXT_DATA__; null when the layout changed", () => {
  assert.equal(parsePphsPage(hdbPage(THREE_COLUMN_TABLE))?.length, 2);
  assert.equal(parsePphsPage(hdbPage(null)), null, "no accordion with a table");
  assert.equal(parsePphsPage("<html><body>maintenance</body></html>"), null, "no __NEXT_DATA__");
  assert.equal(extractPphsTableHtml('<script id="__NEXT_DATA__">{not json</script>'), null, "bad JSON");
  assert.equal(parsePphsTable("<p>no table</p>"), null);
});

// ── Validators ──

test("validatePphsListQuery: blank → null, YYYYMM with a real month only", () => {
  assert.deepEqual(validatePphsListQuery({}), { batch: null });
  assert.deepEqual(validatePphsListQuery({ batch: "" }), { batch: null });
  assert.deepEqual(validatePphsListQuery({ batch: "202512" }), { batch: "202512" });
  for (const batch of ["202513", "202500", "12025", "2025-12", ["202512"], "abcdef"]) {
    assert.throws(() => validatePphsListQuery({ batch }), Exceptions.InvalidRequest, String(batch));
  }
});

test("validateAddressBody trims and caps at the building column width", () => {
  assert.deepEqual(validateAddressBody({ address: "  Blk 1 Road " }), { address: "Blk 1 Road" });
  for (const address of [undefined, "", "   ", 5, "x".repeat(1025)]) {
    assert.throws(() => validateAddressBody({ address }), Exceptions.InvalidRequest, String(address));
  }
});

test("validateCoordinatesUpdateBody accepts numbers or decimal strings, normalises to VARCHAR(16), ignores formedUrl", () => {
  const body = validateCoordinatesUpdateBody({
    address: "Blk 1",
    lat: "1.29758954788137",
    lng: 103.83168969858612,
    formedUrl: "javascript:alert(1)", // older clients still send it; never used
  });
  assert.deepEqual(body, { address: "Blk 1", lat: "1.29758955", lng: "103.8316897" });
});

test("validateCoordinatesUpdateBody rejects missing, malformed and out-of-range values", () => {
  const ok = { address: "a", lat: "1.3", lng: "103.8" };
  const cases: [Row, string][] = [
    [{ ...ok, lat: undefined }, "invalid_request_lat"],
    [{ ...ok, lat: "" }, "invalid_request_lat"],
    [{ ...ok, lat: "91" }, "invalid_request_lat"],
    [{ ...ok, lat: "1e1" }, "invalid_request_lat"],
    [{ ...ok, lng: "-180.5" }, "invalid_request_lng"],
    [{ ...ok, lng: "abc" }, "invalid_request_lng"],
  ];
  for (const [body, code] of cases) {
    assert.throws(
      () => validateCoordinatesUpdateBody(body),
      (e: Error & { code?: string }) => e instanceof Exceptions.InvalidRequest && e.code === code,
      JSON.stringify(body),
    );
  }
});

test("validateNearbyBusStopsQuery: numeric lat/lng in range, whole-number radius 0..cap", () => {
  assert.deepEqual(validateNearbyBusStopsQuery({ lat: "1.35", lng: "103.84", radius: "0" }), {
    lat: 1.35,
    lng: 103.84,
    radiusM: 0,
  });
  for (const radius of [undefined, "", "-1", "1.5", String(NEARBY_BUS_STOPS_MAX_RADIUS_M + 1), "abc"]) {
    assert.throws(
      () => validateNearbyBusStopsQuery({ lat: "1.35", lng: "103.84", radius }),
      Exceptions.InvalidRequest,
      String(radius),
    );
  }
  assert.throws(() => validateNearbyBusStopsQuery({ lng: "103.84", radius: "300" }), Exceptions.InvalidRequest);
  assert.throws(() => validateNearbyBusStopsQuery({ lat: "", lng: "", radius: "300" }), Exceptions.InvalidRequest);
});

test("validateNearestMrtStationsQuery defaults the limit and caps it", () => {
  assert.equal(validateNearestMrtStationsQuery({ lat: "1.35", lng: "103.84" }).limit, DEFAULT_MRT_STATION_LIMIT);
  assert.equal(validateNearestMrtStationsQuery({ lat: "1.35", lng: "103.84", limit: "5" }).limit, 5);
  for (const limit of ["0", String(MAX_MRT_STATION_LIMIT + 1), "2.5"]) {
    assert.throws(
      () => validateNearestMrtStationsQuery({ lat: "1.35", lng: "103.84", limit }),
      Exceptions.InvalidRequest,
      limit,
    );
  }
});

// ── Mappers / helpers ──

test("mappers turn LTA rows into camelCase DTOs with whole metres", () => {
  assert.deepEqual(
    toNearbyBusStopDto({ busstop_code: "53231", road_name: "Bishan Rd", desc: "Opp Blk 1", distance_m: 123.6 }),
    {
      busStopCode: "53231",
      roadName: "Bishan Rd",
      description: "Opp Blk 1",
      distanceM: 124,
    },
  );
  assert.deepEqual(toNearestMrtStationDto({ station: "BISHAN MRT STATION", type: "MRT", distance_m: 410.2 }), {
    station: "BISHAN MRT STATION",
    type: "MRT",
    distanceM: 410,
  });
});

test("toBuildingKey keeps the stored '+' form; googleMapsUrl keeps the stored URL form", () => {
  assert.equal(toBuildingKey("Blk 1  Jalan\tBukit Merah"), "Blk+1+Jalan+Bukit+Merah");
  assert.equal(googleMapsUrl("1.2851", "103.8198"), "https://www.google.com/maps?q=1.2851,103.8198");
});

test("currentPphsBatch = latest even month in Singapore (same rule as fndom's batch switcher)", () => {
  assert.equal(currentPphsBatch(new Date("2026-11-15T04:00:00Z")), "202610", "odd month → previous even month");
  assert.equal(currentPphsBatch(new Date("2026-12-15T04:00:00Z")), "202612", "even month → itself");
  assert.equal(currentPphsBatch(new Date("2027-01-10T04:00:00Z")), "202612", "January → previous December");
  assert.equal(currentPphsBatch(new Date("2026-01-31T17:00:00Z")), "202602", "01:00 SGT on 1 Feb (still 31 Jan UTC)");
  assert.equal(currentPphsBatch(new Date("2026-02-28T17:00:00Z")), "202602", "01:00 SGT on 1 Mar (odd) → Feb");
});

// ── Coordinate service ──

const COORDINATE_TABLE = "tb_hdb_pphs_coordinate";

test("resolve: cache hit returns the stored point without calling a geocoder", async () => {
  const { db } = fakeDb({ [COORDINATE_TABLE]: [coordinateRow("Blk 1 Road", "1.3", "103.8")] });
  const urls = stubFetch({});
  const result = await new HdbCoordinateService(db).resolve("Blk 1 Road");
  assert.deepEqual(result, { lat: "1.3", lng: "103.8", formedUrl: googleMapsUrl("1.3", "103.8"), source: "database" });
  assert.equal(urls.length, 0);
});

test("resolve: a blank cached row (cleared / multi-block) is 'unparseable'", async () => {
  const { db } = fakeDb({ [COORDINATE_TABLE]: [coordinateRow("Blk 1 Road", "", "")] });
  stubFetch({});
  assert.equal((await new HdbCoordinateService(db).resolve("Blk 1 Road")).source, "unparseable");
});

test("resolve: multi-block addresses are cached blank without geocoding", async () => {
  const { db, calls } = fakeDb();
  const urls = stubFetch({});
  const result = await new HdbCoordinateService(db).resolve("Blk 36, 43 & 44 Tanglin Halt Road");
  assert.equal(result.source, "unparseable");
  assert.equal(urls.length, 0);
  assert.equal(calls.inserts[0].data.building, "Blk+36,+43+&+44+Tanglin+Halt+Road");
  assert.equal(calls.inserts[0].data.lat, "");
});

test("resolve: OneMap hit is cached under the building key", async () => {
  const { db, calls } = fakeDb();
  const urls = stubFetch({ [ONEMAP_HOST]: ONEMAP_HIT });
  const result = await new HdbCoordinateService(db).resolve("Blk 1 Road");
  assert.deepEqual(result, {
    lat: "1.2851",
    lng: "103.8198",
    formedUrl: googleMapsUrl("1.2851", "103.8198"),
    source: "onemap",
  });
  assert.equal(new URL(urls[0]).searchParams.get("searchVal"), "Blk 1 Road");
  assert.deepEqual(
    calls.inserts.map((i) => [i.table, i.data.building, i.data.lat]),
    [[COORDINATE_TABLE, "Blk+1+Road", "1.2851"]],
  );
});

test("resolve: OneMap miss falls back to Nominatim (sg only); both failing → 'error', nothing cached", async () => {
  const { db, calls } = fakeDb();
  const urls = stubFetch({
    [ONEMAP_HOST]: ONEMAP_MISS,
    [NOMINATIM_HOST]: { ok: true, json: [{ lat: "1.4", lon: "103.9" }] },
  });
  const svc = new HdbCoordinateService(db);
  const viaNominatim = await svc.resolve("Blk 2 Road");
  assert.equal(viaNominatim.source, "nominatim");
  assert.equal(viaNominatim.lng, "103.9");
  const nominatimUrl = new URL(urls[1]);
  assert.equal(nominatimUrl.searchParams.get("q"), "Blk 2 Road Singapore");
  assert.equal(nominatimUrl.searchParams.get("countrycodes"), "sg");
  assert.equal(nominatimUrl.searchParams.get("limit"), "1");
  assert.equal(calls.inserts.length, 1);

  stubFetch({ [ONEMAP_HOST]: { ok: false, status: 503 }, [NOMINATIM_HOST]: { ok: false, status: 503 } });
  const failed = await svc.resolve("Blk 3 Road");
  assert.deepEqual(failed, { lat: "", lng: "", formedUrl: "", source: "error" });
  assert.equal(calls.inserts.length, 1, "failures are not cached");
});

test("refresh drops the cached row and geocodes again; clear leaves one blank row", async () => {
  const { db, rows } = fakeDb({ [COORDINATE_TABLE]: [coordinateRow("Blk 1 Road", "9.9", "9.9")] });
  stubFetch({ [ONEMAP_HOST]: ONEMAP_HIT });
  const svc = new HdbCoordinateService(db);
  assert.equal((await svc.refresh("Blk 1 Road")).source, "onemap");
  assert.deepEqual(
    rows[COORDINATE_TABLE].map((r) => r.lat),
    ["1.2851"],
  );

  assert.deepEqual(await svc.clear("Blk 1 Road"), { cleared: true });
  assert.deepEqual(
    rows[COORDINATE_TABLE].map((r) => [r.building, r.lat]),
    [["Blk+1+Road", ""]],
  );
});

test("update overwrites an existing cached row, stamps the admin and builds formedUrl", async () => {
  const { db, rows, calls } = fakeDb({ [COORDINATE_TABLE]: [coordinateRow("Blk 1 Road", "", "")] });
  const result = await new HdbCoordinateService(db).update(
    { address: "Blk 1 Road", lat: "1.3", lng: "103.8" },
    "admin",
  );
  assert.deepEqual(result, {
    lat: "1.3",
    lng: "103.8",
    formedUrl: googleMapsUrl("1.3", "103.8"),
    updated: 1,
    created: false,
  });
  assert.equal(rows[COORDINATE_TABLE].length, 1);
  assert.equal(rows[COORDINATE_TABLE][0].lat, "1.3");
  assert.equal(rows[COORDINATE_TABLE][0].formed_url, googleMapsUrl("1.3", "103.8"));
  assert.equal(rows[COORDINATE_TABLE][0].modified_by, "admin");
  assert.equal(calls.inserts.length, 0);
});

test("update inserts the cache row (same key format as resolve) when the address has none", async () => {
  const { db, rows } = fakeDb();
  const svc = new HdbCoordinateService(db);
  const result = await svc.update({ address: "Blk 7  Unmapped Rd", lat: "1.4", lng: "103.9" }, "admin");
  assert.deepEqual(result, {
    lat: "1.4",
    lng: "103.9",
    formedUrl: googleMapsUrl("1.4", "103.9"),
    updated: 1,
    created: true,
  });
  const [row] = rows[COORDINATE_TABLE];
  assert.equal(row.building, "Blk+7+Unmapped+Rd");
  assert.equal(row.formed_url, googleMapsUrl("1.4", "103.9"));
  assert.equal(row.created_by, "admin");
  assert.equal(row.modified_by, "admin");
  // The next PPHS list serves it from the cache (no geocoder call).
  const urls = stubFetch({});
  assert.equal((await svc.resolve("Blk 7 Unmapped Rd")).source, "database");
  assert.equal(urls.length, 0);
});

// ── PPHS list ──

const PPHS_TABLE = "tb_hdb_pphs";
const STORED_RECORD = {
  town: "Queenstown",
  address: "Blk 9 Dawson Rd",
  flatTypes: { "2-room": "4" },
  siteExpiry: "Mar 2028",
};

test("listPphs serves a stored batch with cached coordinates (no outbound call)", async () => {
  const { db } = fakeDb({
    [PPHS_TABLE]: [{ batch: "202512", json_string: JSON.stringify([STORED_RECORD]) }],
    [COORDINATE_TABLE]: [coordinateRow(STORED_RECORD.address, "1.3", "103.8")],
  });
  const urls = stubFetch({});
  const { records } = await new HdbService(db).listPphs("202512");
  assert.deepEqual(records, [
    { ...STORED_RECORD, lat: "1.3", lng: "103.8", formedUrl: googleMapsUrl("1.3", "103.8"), source: "database" },
  ]);
  assert.equal(urls.length, 0);
});

test("listPphs scrapes and stores the current batch when it isn't stored", async () => {
  const { db, rows } = fakeDb({
    [COORDINATE_TABLE]: [coordinateRow("Blk 9 Dawson Rd", "1.3", "103.8"), coordinateRow("Blk 10 Dawson Rd", "", "")],
  });
  const urls = stubFetch({ [HDB_HOST]: { ok: true, text: hdbPage(THREE_COLUMN_TABLE) } });
  const { records } = await new HdbService(db).listPphs(currentPphsBatch());
  assert.deepEqual(
    records.map((r) => [r.address, r.source]),
    [
      ["Blk 9 Dawson Rd", "database"],
      ["Blk 10 Dawson Rd", "unparseable"],
    ],
  );
  assert.equal(urls.length, 1);
  assert.equal(rows[PPHS_TABLE][0].batch, currentPphsBatch());
  assert.equal(JSON.parse(rows[PPHS_TABLE][0].json_string).length, 2);
});

test("listPphs: no batch given → the current batch (scraped when missing)", async () => {
  const { db, rows } = fakeDb();
  stubFetch({ [HDB_HOST]: { ok: true, text: hdbPage(null) } });
  await assert.rejects(new HdbService(db).listPphs(null), Exceptions.ExternalRequest); // reached the scrape
  assert.equal(rows[PPHS_TABLE]?.length ?? 0, 0);
});

test("listPphs in an odd month: the default request scrapes and stores the previous even month", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-15T04:00:00Z") }); // 15 Nov 2026 SGT
  const { db, rows } = fakeDb({
    [COORDINATE_TABLE]: [coordinateRow("Blk 9 Dawson Rd", "1.3", "103.8"), coordinateRow("Blk 10 Dawson Rd", "", "")],
  });
  stubFetch({ [HDB_HOST]: { ok: true, text: hdbPage(THREE_COLUMN_TABLE) } });
  const svc = new HdbService(db);
  assert.equal((await svc.listPphs(null)).records.length, 2);
  assert.deepEqual(
    rows[PPHS_TABLE].map((r) => r.batch),
    ["202610"],
  );
  // What fndom sends by default in November (its latest even month) is served from the stored row.
  stubFetch({});
  assert.equal((await svc.listPphs("202610")).records.length, 2);
  // The calendar month itself is not a batch, so it isn't scraped.
  await assert.rejects(svc.listPphs("202611"), Exceptions.NotFound);
});

test("listPphs: any other unstored batch → 404 NotFound with no outbound call and nothing stored", async () => {
  const { db, rows } = fakeDb();
  const urls = stubFetch({});
  for (const batch of ["201901", "209912"]) {
    await assert.rejects(new HdbService(db).listPphs(batch), Exceptions.NotFound, batch);
  }
  assert.equal(urls.length, 0);
  assert.equal(rows[PPHS_TABLE]?.length ?? 0, 0);
});

test("listPphs: HDB unreachable or page layout changed → ExternalRequest, nothing stored", async () => {
  for (const hdb of [
    { ok: false, status: 503 },
    { ok: true, text: hdbPage(null) },
  ]) {
    const { db, rows } = fakeDb();
    stubFetch({ [HDB_HOST]: hdb });
    await assert.rejects(new HdbService(db).listPphs(currentPphsBatch()), Exceptions.ExternalRequest);
    assert.equal(rows[PPHS_TABLE]?.length ?? 0, 0);
  }
});

// ── HTTP (controller on a throwaway server; real MandatoryTokenFilter with its DB lookup mocked) ──

describe("HTTP /hdb", () => {
  let server: Server;
  let base: string;
  const userRoles: Record<string, string[]> = { admin: [Roles.PPHS_ADMIN], owner: [Roles.OWNER], plain: [] };
  const tokens: Record<string, string> = {};
  const previousSecret = process.env.JWT_SECRET;
  const { db, rows, calls } = fakeDb({ [COORDINATE_TABLE]: [coordinateRow("Blk 1 Road", "", "")] }, [
    { busstop_code: "53231", road_name: "Bishan Rd", desc: "Opp Blk 1", distance_m: 99.7 },
  ]);

  before(async () => {
    process.env.JWT_SECRET = "test-secret";
    for (const [username, roles] of Object.entries(userRoles)) {
      tokens[username] = signToken({ id: 1, username, system: "fnd", roles, lastLoggedInDt: 0 });
    }
    // TokenFilter's revocation lookup: the cookie's token must be the user's stored one.
    mock.method(tokenFilterDb, "findOne", async (_t: string, where: { username_system: string }) => {
      const username = where.username_system.replace(/_fnd$/, "");
      return { id: 1, token: tokens[username], roles: JSON.stringify(userRoles[username]) };
    });

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    const fakeLogContext: RequestHandler = (req, _res, next) => {
      req.logContext = {
        requestId: "test",
        startTime: 0,
        method: req.method,
        path: req.path,
        ip: "",
        events: [],
      } as never;
      next();
    };
    app.use(fakeLogContext);
    app.use("/hdb", createHdbController(db));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hdb`;
  });

  after(async () => {
    mock.restoreAll();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };
  const post = async (path: string, body: unknown, user?: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (user) {
      headers.Cookie = `jwt_token=${tokens[user]}; csrf_token=csrf123`;
      headers["X-CSRF-Token"] = "csrf123";
    }
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  test("GET /pphs/busstops → camelCase { busStops, count }, lng bound before lat", async () => {
    calls.raw.length = 0;
    const { status, json } = await get("/pphs/busstops?lat=1.35&lng=103.84&radius=500");
    assert.equal(status, 200);
    assert.deepEqual(json.data, {
      busStops: [{ busStopCode: "53231", roadName: "Bishan Rd", description: "Opp Blk 1", distanceM: 100 }],
      count: 1,
    });
    assert.deepEqual(calls.raw[0].bindings, [103.84, 1.35, 103.84, 1.35, 500]);
  });

  test("GET /pphs/busstops with bad or missing params → 400 per field", async () => {
    for (const [query, code] of [
      ["lat=&lng=103.84&radius=500", "invalid_request_lat"],
      ["lat=1.35&lng=181&radius=500", "invalid_request_lng"],
      ["lat=1.35&lng=103.84", "invalid_request_radius"],
      ["lat=1.35&lng=103.84&radius=99999", "invalid_request_radius"],
    ]) {
      const { status, json } = await get(`/pphs/busstops?${query}`);
      assert.equal(status, 400, query);
      assert.equal(json.data.code, code, query);
    }
  });

  test("GET /pphs/mrt → camelCase { stations, count } with the default limit", async () => {
    calls.raw.length = 0;
    const { status, json } = await get("/pphs/mrt?lat=1.35&lng=103.84");
    assert.equal(status, 200);
    assert.equal(json.data.count, 1);
    assert.deepEqual(Object.keys(json.data), ["stations", "count"]);
    assert.deepEqual(calls.raw[0].bindings, [103.84, 1.35, DEFAULT_MRT_STATION_LIMIT]);
    assert.equal((await get("/pphs/mrt?lat=1.35&lng=103.84&limit=50")).status, 400);
  });

  test("GET /pphs?batch=bad → 400; the old POST /pphs search is gone", async () => {
    const bad = await get("/pphs?batch=202513");
    assert.equal(bad.status, 400);
    assert.equal(bad.json.data.code, "invalid_request_batch");
    assert.equal((await post("/pphs", { batch: "202512" })).status, 404);
  });

  test("admin routes: no cookie → 401 token_invalid, no PPHS/owner role → 403 forbidden_access", async () => {
    for (const path of ["/pphs/update", "/pphs/clear-coordinates", "/pphs/geocode-options", "/pphs/refresh"]) {
      const anonymous = await post(path, { address: "Blk 1 Road" });
      assert.equal(anonymous.status, 401, path);
      assert.equal(anonymous.json.status, "token_invalid", path);
      const plain = await post(path, { address: "Blk 1 Road" }, "plain");
      assert.equal(plain.status, 403, path);
      assert.equal(plain.json.data.code, "forbidden_access", path);
    }
  });

  test("POST /pphs/update as PPHS admin validates, then writes and reports the count", async () => {
    const bad = await post("/pphs/update", { address: "Blk 1 Road", lat: "x", lng: "103.8" }, "admin");
    assert.equal(bad.status, 400);
    assert.equal(bad.json.data.code, "invalid_request_lat");

    const ok = await post(
      "/pphs/update",
      { address: "Blk 1 Road", lat: "1.3", lng: "103.8", formedUrl: "https://example.com/ignored" },
      "admin",
    );
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.data, {
      lat: "1.3",
      lng: "103.8",
      formedUrl: googleMapsUrl("1.3", "103.8"),
      updated: 1,
      created: false,
    });
    assert.equal(rows[COORDINATE_TABLE][0].modified_by, "admin");
  });

  test("GET /pphs for an unstored past batch → 404 entity_not_found", async () => {
    const { status, json } = await get("/pphs?batch=201901");
    assert.equal(status, 404);
    assert.equal(json.data.code, "entity_not_found");
  });

  test("POST /pphs/clear-coordinates as owner → { cleared: true }; missing address → 400", async () => {
    assert.equal((await post("/pphs/clear-coordinates", {}, "owner")).status, 400);
    const ok = await post("/pphs/clear-coordinates", { address: "Blk 1 Road" }, "owner");
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.data, { cleared: true });
  });

  test("POST /pphs/geocode-options as admin lists the live options (geocoders stubbed)", async () => {
    stubFetch({ [ONEMAP_HOST]: ONEMAP_HIT, [NOMINATIM_HOST]: { ok: true, json: [] } });
    const { status, json } = await post("/pphs/geocode-options", { address: "Blk 1 Road" }, "admin");
    assert.equal(status, 200);
    assert.deepEqual(json.data, [
      { lat: "1.2851", lng: "103.8198", formedUrl: googleMapsUrl("1.2851", "103.8198"), source: "onemap" },
    ]);
  });
});
