import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { LtaService, NEARBY_BUS_STOPS_MAX_ROWS, toBusServiceDto } from "./Lta.service.js";
import { validateBusStopCodeQuery } from "./Lta.validator.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

/** Stand-in for KnexSqlUtilities.raw: records each call and returns the given rows. */
function fakeDb(rows: unknown[] = []) {
  const calls: { sql: string; bindings: unknown[] }[] = [];
  const db = {
    async raw(sql: string, bindings: unknown[]) {
      calls.push({ sql, bindings });
      return rows;
    },
  };
  return { db: db as never, calls };
}

const busInfoRow = {
  service_no: "13",
  operator: "SBST",
  direction: "1",
  stop_sequence: "11",
  distance: "4.1",
  wd_first_bus: "0553",
  wd_last_bus: "2346",
  sat_first_bus: "0603",
  sat_last_bus: "2346",
  sun_first_bus: "0600",
  sun_last_bus: "2346",
};

// ── Validator ──

test("validateBusStopCodeQuery trims and accepts a 5-digit code", () => {
  assert.deepEqual(validateBusStopCodeQuery({ busStopCode: " 53231 " }), { busStopCode: "53231" });
});

test("validateBusStopCodeQuery rejects missing, non-string and malformed codes", () => {
  for (const busStopCode of [undefined, "", 53231, ["53231"], "5323", "532311", "abcde"]) {
    assert.throws(() => validateBusStopCodeQuery({ busStopCode }), Exceptions.InvalidRequest, String(busStopCode));
  }
});

// ── Bus services ──

test("toBusServiceDto maps every column to camelCase", () => {
  assert.deepEqual(toBusServiceDto(busInfoRow), {
    serviceNo: "13",
    operator: "SBST",
    direction: "1",
    stopSequence: "11",
    distance: "4.1",
    weekdayFirstBus: "0553",
    weekdayLastBus: "2346",
    saturdayFirstBus: "0603",
    saturdayLastBus: "2346",
    sundayFirstBus: "0600",
    sundayLastBus: "2346",
  });
});

test("listBusServices queries by stop code and returns mapped services with their count", async () => {
  const { db, calls } = fakeDb([busInfoRow, { ...busInfoRow, service_no: "13A" }]);
  const result = await new LtaService(db).listBusServices("53231");
  assert.deepEqual(calls[0].bindings, ["53231"]);
  assert.deepEqual(
    result.services.map((s) => s.serviceNo),
    ["13", "13A"],
  );
  assert.equal(result.count, 2);
});

// ── Proximity (hdb) ──

test("findBusStopsNear caps rows but reports the full count, binding lng before lat", async () => {
  const stops = Array.from({ length: NEARBY_BUS_STOPS_MAX_ROWS + 5 }, (_, i) => ({ busstop_code: String(i) }));
  const { db, calls } = fakeDb(stops);
  const result = await new LtaService(db).findBusStopsNear(1.35, 103.84, 300);
  assert.equal(result.rows.length, NEARBY_BUS_STOPS_MAX_ROWS);
  assert.equal(result.count, NEARBY_BUS_STOPS_MAX_ROWS + 5);
  assert.deepEqual(calls[0].bindings, [103.84, 1.35, 103.84, 1.35, 300]);
});

test("findNearestMrtStations keeps the swapped-column POINT and binds the limit", async () => {
  const { db, calls } = fakeDb([{ station: "BISHAN MRT STATION", type: "MRT", distance_m: 10 }]);
  const result = await new LtaService(db).findNearestMrtStations(1.35, 103.84, 3);
  assert.match(calls[0].sql, /POINT\(e\.lat, e\.lng\)/);
  assert.deepEqual(calls[0].bindings, [103.84, 1.35, 3]);
  assert.equal(result.count, 1);
});

// ── DataMall bus arrivals ──

const realFetch = globalThis.fetch;
const realKey = process.env.LTA_DATAMALL_API_KEY;
let fetchedUrls: string[] = [];

function stubFetch(impl: () => Promise<Response>) {
  globalThis.fetch = (async (url: string | URL) => {
    fetchedUrls.push(String(url));
    return impl();
  }) as typeof fetch;
}

beforeEach(() => {
  fetchedUrls = [];
  process.env.LTA_DATAMALL_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.LTA_DATAMALL_API_KEY;
  else process.env.LTA_DATAMALL_API_KEY = realKey;
});

test("getBusArrivals passes DataMall's Services through as records", async () => {
  const services = [{ ServiceNo: "50", Operator: "SBST" }];
  stubFetch(async () => new Response(JSON.stringify({ Services: services }), { status: 200 }));
  const result = await new LtaService(fakeDb().db).getBusArrivals("53231");
  assert.deepEqual(result, { records: services });
  assert.equal(new URL(fetchedUrls[0]).searchParams.get("BusStopCode"), "53231");
});

test("getBusArrivals returns no records when DataMall omits Services", async () => {
  stubFetch(async () => new Response("{}", { status: 200 }));
  assert.deepEqual(await new LtaService(fakeDb().db).getBusArrivals("53231"), { records: [] });
});

test("getBusArrivals turns a non-OK DataMall response into a 502 ExternalRequest", async () => {
  stubFetch(async () => new Response("nope", { status: 503 }));
  await assert.rejects(new LtaService(fakeDb().db).getBusArrivals("53231"), (err: unknown) => {
    assert.ok(err instanceof Exceptions.ExternalRequest);
    assert.equal(err.httpStatus, 502);
    return true;
  });
});

test("getBusArrivals turns a network failure into an ExternalRequest", async () => {
  stubFetch(async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(new LtaService(fakeDb().db).getBusArrivals("53231"), Exceptions.ExternalRequest);
});

test("getBusArrivals without an API key is a 500 Unknown and never calls DataMall", async () => {
  delete process.env.LTA_DATAMALL_API_KEY;
  stubFetch(async () => new Response("{}", { status: 200 }));
  await assert.rejects(new LtaService(fakeDb().db).getBusArrivals("53231"), Exceptions.Unknown);
  assert.equal(fetchedUrls.length, 0);
});
