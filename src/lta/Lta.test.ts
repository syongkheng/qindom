import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { RequestHandler } from "express";
import createLtaController from "./Lta.controller.js";
import {
  LtaService,
  NEARBY_BUS_STOPS_MAX_ROWS,
  toBusServiceDto,
  toNearbyBusStopDto,
  toNearestMrtStationDto,
} from "./Lta.service.js";
import {
  DEFAULT_MRT_STATION_LIMIT,
  MAX_MRT_STATION_LIMIT,
  NEARBY_BUS_STOPS_MAX_RADIUS_M,
  validateBusStopCodeQuery,
  validateNearbyBusStopsQuery,
  validateNearestMrtStationsQuery,
} from "./Lta.validator.js";
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

test("validateNearbyBusStopsQuery: decimal lat/lng in range, whole-number radius 0..cap", () => {
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
  for (const [lat, lng] of [
    [undefined, "103.84"],
    ["", ""],
    ["91", "103.84"],
    ["1.35", "-180.5"],
    ["1e1", "103.84"],
    ["Infinity", "103.84"],
    [["1.35", "1.36"], "103.84"],
  ]) {
    assert.throws(
      () => validateNearbyBusStopsQuery({ lat, lng, radius: "300" }),
      Exceptions.InvalidRequest,
      JSON.stringify([lat, lng]),
    );
  }
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

// ── Proximity ──

test("proximity mappers turn rows into camelCase DTOs with whole metres", () => {
  assert.deepEqual(
    toNearbyBusStopDto({ busstop_code: "53231", road_name: "Bishan Rd", desc: "Opp Blk 1", distance_m: 123.6 }),
    { busStopCode: "53231", roadName: "Bishan Rd", description: "Opp Blk 1", distanceM: 124 },
  );
  assert.deepEqual(toNearestMrtStationDto({ station: "BISHAN MRT STATION", type: "MRT", distance_m: 410.2 }), {
    station: "BISHAN MRT STATION",
    type: "MRT",
    distanceM: 410,
  });
});

test("findBusStopsNear caps the stops but reports the full count, binding lng before lat", async () => {
  const stops = Array.from({ length: NEARBY_BUS_STOPS_MAX_ROWS + 5 }, (_, i) => ({
    busstop_code: String(i),
    road_name: null,
    desc: null,
    distance_m: i,
  }));
  const { db, calls } = fakeDb(stops);
  const result = await new LtaService(db).findBusStopsNear({ lat: 1.35, lng: 103.84, radiusM: 300 });
  assert.equal(result.busStops.length, NEARBY_BUS_STOPS_MAX_ROWS);
  assert.equal(result.busStops[0].busStopCode, "0");
  assert.equal(result.count, NEARBY_BUS_STOPS_MAX_ROWS + 5);
  assert.deepEqual(calls[0].bindings, [103.84, 1.35, 103.84, 1.35, 300]);
});

test("findNearestMrtStations keeps the swapped-column POINT and binds the limit", async () => {
  const { db, calls } = fakeDb([{ station: "BISHAN MRT STATION", type: "MRT", distance_m: 10 }]);
  const result = await new LtaService(db).findNearestMrtStations({ lat: 1.35, lng: 103.84, limit: 3 });
  assert.match(calls[0].sql, /POINT\(e\.lat, e\.lng\)/);
  assert.deepEqual(calls[0].bindings, [103.84, 1.35, 3]);
  assert.deepEqual(result, { stations: [{ station: "BISHAN MRT STATION", type: "MRT", distanceM: 10 }], count: 1 });
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

// ── HTTP (controller on a throwaway server, fake DB; nothing leaves the machine) ──

describe("HTTP /lta proximity", () => {
  let server: Server;
  let base: string;
  const { db, calls } = fakeDb([
    { busstop_code: "53231", road_name: "Bishan Rd", desc: "Opp Blk 1", distance_m: 99.7 },
  ]);

  before(async () => {
    const app = express();
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
    app.use("/lta", createLtaController(db));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/lta`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const get = async (path: string) => {
    const res = await realFetch(`${base}${path}`);
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  test("GET /bus-stops/nearby → camelCase { busStops, count }, lng bound before lat", async () => {
    calls.length = 0;
    const { status, json } = await get("/bus-stops/nearby?lat=1.35&lng=103.84&radius=500");
    assert.equal(status, 200);
    assert.deepEqual(json.data, {
      busStops: [{ busStopCode: "53231", roadName: "Bishan Rd", description: "Opp Blk 1", distanceM: 100 }],
      count: 1,
    });
    assert.deepEqual(calls[0].bindings, [103.84, 1.35, 103.84, 1.35, 500]);
  });

  test("GET /bus-stops/nearby with bad or missing params → 400 per field, no query", async () => {
    calls.length = 0;
    for (const [query, code] of [
      ["lat=&lng=103.84&radius=500", "invalid_request_lat"],
      ["lat=1.35&lng=181&radius=500", "invalid_request_lng"],
      ["lat=1.35&lng=103.84", "invalid_request_radius"],
      ["lat=1.35&lng=103.84&radius=99999", "invalid_request_radius"],
    ]) {
      const { status, json } = await get(`/bus-stops/nearby?${query}`);
      assert.equal(status, 400, query);
      assert.equal(json.data.code, code, query);
    }
    assert.equal(calls.length, 0);
  });

  test("GET /mrt-stations/nearest → { stations, count } with the default limit; limit over the cap → 400", async () => {
    calls.length = 0;
    const { status, json } = await get("/mrt-stations/nearest?lat=1.35&lng=103.84");
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json.data), ["stations", "count"]);
    assert.equal(json.data.count, 1);
    assert.deepEqual(calls[0].bindings, [103.84, 1.35, DEFAULT_MRT_STATION_LIMIT]);
    const bad = await get("/mrt-stations/nearest?lat=1.35&lng=103.84&limit=50");
    assert.equal(bad.status, 400);
    assert.equal(bad.json.data.code, "invalid_request_limit");
  });
});
