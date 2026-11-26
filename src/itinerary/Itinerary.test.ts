import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { RequestHandler } from "express";
import cookieParser from "cookie-parser";
import { signToken } from "../token/Token.service.js";
import tokenFilterDb from "../config/db/mysql.js";
import createItineraryController from "./Itinerary.controller.js";
import {
  minutesToTime,
  timeToMinutes,
  toAgendaItemDto,
  toBookingDto,
  toItineraryDto,
  toPackingItemDto,
  toPublicItineraryDto,
} from "./Itinerary.service.js";
import { agendaColumns, bookingColumns, noteColumns, packingColumns } from "./ItinerarySave.service.js";
import {
  normaliseCityRaw,
  validateAgendaItemBody,
  validateBookingBody,
  validateChallengeBody,
  validateCreateBody,
  validateNoteItemBody,
  validatePackingItemBody,
  validateUpdateBody,
} from "./Itinerary.validator.js";

type Row = Record<string, any>;

const ALICE = 1;
const BOB = 2;

const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
/** knex drops undefined keys from inserts/updates. */
const defined = (data: Row) => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

/**
 * In-memory stand-in for KnexSqlUtilities plus the raw knex trx the save service uses.
 * `transaction` restores a snapshot on error and rethrows a plain Error, like the real one.
 */
function fakeDb(seed: Record<string, Row[]>) {
  let tables: Record<string, Row[]> = structuredClone(seed);
  let nextId = 1000;
  const rowsOf = (t: string) => (tables[t] ??= []);
  const insertRows = (t: string, data: Row | Row[]) =>
    (Array.isArray(data) ? data : [data]).map((d) => {
      const row = { id: nextId++, ...defined(d) };
      rowsOf(t).push(row);
      return row.id;
    });

  const trx = (t: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const selected = () => rowsOf(t).filter((r) => filters.every((f) => f(r)));
    const qb = {
      where(w: Row) {
        filters.push((r) => matches(r, w));
        return qb;
      },
      whereIn(col: string, values: unknown[]) {
        filters.push((r) => values.includes(r[col]));
        return qb;
      },
      async update(data: Row) {
        const hit = selected();
        hit.forEach((r) => Object.assign(r, defined(data)));
        return hit.length;
      },
      async insert(data: Row | Row[]) {
        return insertRows(t, data);
      },
      async pluck(col: string) {
        return selected().map((r) => r[col]);
      },
    };
    return qb;
  };

  const db = {
    async find(
      t: string,
      where: Row,
      opts: {
        orderBy?: string;
        orderDirection?: string;
        columns?: readonly string[];
        extraWhere?: (qb: any) => void;
      } = {},
    ) {
      let found = rowsOf(t).filter((r) => matches(r, where));
      opts.extraWhere?.({
        whereIn: (col: string, values: unknown[]) => {
          found = found.filter((r) => values.includes(r[col]));
        },
      });
      if (opts.orderBy) {
        const k = opts.orderBy;
        found = [...found].sort((a, b) => (a[k] - b[k]) * (opts.orderDirection === "desc" ? -1 : 1));
      }
      return found.map((r) =>
        opts.columns ? Object.fromEntries(opts.columns.map((c) => [c, r[c] ?? null])) : { ...r },
      );
    },
    async findOne(t: string, where: Row) {
      const r = rowsOf(t).find((x) => matches(x, where));
      return r ? { ...r } : undefined;
    },
    async count(t: string, where: Row) {
      return rowsOf(t).filter((r) => matches(r, where)).length;
    },
    async insert(t: string, data: Row) {
      const [id] = insertRows(t, data);
      return rowsOf(t).find((r) => r.id === id);
    },
    async update(t: string, where: Row, data: Row) {
      const hit = rowsOf(t).filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, defined(data)));
      return hit;
    },
    async transaction<T>(cb: (trx: unknown) => Promise<T>): Promise<T> {
      const snapshot = structuredClone(tables);
      try {
        return await cb(trx);
      } catch (err) {
        tables = snapshot;
        throw new Error(`Transaction failed: ${(err as Error).message}`);
      }
    },
  };
  return { db: db as never, tables: () => tables };
}

const itinerary = (id: number, owner: number, extra: Row = {}): Row => ({
  id,
  session_id: `s${id}`,
  short_code: `code${id}`,
  idempotency_key: null,
  session_title: `Trip ${id}`,
  destination: "Tokyo",
  destination_raw: '["Tokyo"]',
  country: "Japan",
  number_of_pax: 2,
  itinerary_date_raw: null,
  start_date: 1_700_000_000_000,
  end_date: 1_700_500_000_000,
  unknown_date: 0,
  duration_in_days: 3,
  challenge: null,
  pax_names: '["A","B"]',
  created_dt: id,
  created_by_id: owner,
  record_status: "A",
  ...extra,
});

const agenda = (id: number, itineraryId: number, extra: Row = {}): Row => ({
  id,
  itinerary_id: itineraryId,
  category: "food",
  list_type: "place",
  title: `Agenda ${id}`,
  desc: null,
  city: null,
  city_raw: null,
  start_time: 9 * 60 + 30,
  end_time: null,
  duration_in_hours: "1.50",
  unknown_time: 0,
  budget: "20.00",
  day: 1,
  date: "2026-12-01",
  coordinates_lat: "35.68950000",
  coordinates_lng: "139.69170000",
  created_dt: 1,
  record_status: "A",
  ...extra,
});

/** Trip 10 (alice, public) and trip 20 (bob, access code 123456), one child of each kind each. */
function seed(): Record<string, Row[]> {
  return {
    tb_travel_itinerary: [itinerary(10, ALICE), itinerary(20, BOB, { challenge: "123456" })],
    tb_travel_agenda_item: [agenda(101, 10), agenda(201, 20)],
    tb_travel_agenda_file: [
      {
        id: 501,
        uuid: "uuid-alice-1",
        agenda_item_id: 101,
        tg_short_code: "aa11aa11",
        name: "a.jpg",
        mime_type: "image/jpeg",
        size_in_bytes: 10,
        blob: "SECRET-BLOB",
        created_dt: 1,
        record_status: "A",
      },
      {
        id: 502,
        uuid: "uuid-bob-1",
        agenda_item_id: 201,
        tg_short_code: "bb22bb22",
        name: "b.jpg",
        mime_type: "image/jpeg",
        size_in_bytes: 20,
        created_dt: 1,
        record_status: "A",
      },
    ],
    tb_travel_itinerary_booking: [
      {
        id: 111,
        itinerary_id: 10,
        item: "Hotel A",
        sort_order: 0,
        booked: 1,
        breakfast: 0,
        created_dt: 1,
        record_status: "A",
      },
      {
        id: 211,
        itinerary_id: 20,
        item: "Hotel B",
        sort_order: 0,
        booked: 0,
        breakfast: 1,
        created_dt: 1,
        record_status: "A",
      },
    ],
    tb_travel_packing_item: [
      {
        id: 121,
        itinerary_id: 10,
        label: "Socks",
        category: null,
        packed: 0,
        quantity: null,
        sort_order: 0,
        record_status: "A",
      },
      {
        id: 221,
        itinerary_id: 20,
        label: "Hat",
        category: "clothes",
        packed: 1,
        quantity: 2,
        sort_order: 0,
        record_status: "A",
      },
    ],
    tb_travel_note_item: [
      {
        id: 131,
        itinerary_id: 10,
        label: "Visa",
        category: null,
        url: null,
        done: 0,
        sort_order: 0,
        record_status: "A",
      },
      {
        id: 231,
        itinerary_id: 20,
        label: "JR pass",
        category: null,
        url: null,
        done: 0,
        sort_order: 0,
        record_status: "A",
      },
    ],
    tb_travel_itinerary_view: [],
    // Uploads (tgimage). dd44dd44 predates `created_by_id` (legacy, uploader unknown).
    tb_tg_image: [
      tgImage(601, "aa11aa11", ALICE),
      tgImage(602, "bb22bb22", BOB),
      tgImage(603, "cc33cc33", ALICE),
      tgImage(604, "dd44dd44", null),
      tgImage(605, "ee55ee55", ALICE, { record_status: "D" }),
    ],
  };
}

function tgImage(id: number, shortCode: string, createdById: number | null, extra: Row = {}): Row {
  return {
    id,
    short_code: shortCode,
    uuid: null,
    telegram_file_id: `F${id}`,
    created_by_id: createdById,
    created_dt: 1,
    record_status: "A",
    ...extra,
  };
}

const imageFile = (uuid: string, extra: Row = {}) => ({
  uuid,
  tgShortCode: "cc33cc33",
  mimeType: "image/png",
  name: "c.png",
  sizeInBytes: 30,
  ...extra,
});

// ─── Pure helpers & mappers ────────────────────────────────────────────────────

describe("time helpers", () => {
  test("HH:MM ↔ minutes", () => {
    assert.equal(timeToMinutes("09:30"), 570);
    assert.equal(timeToMinutes("00:00"), 0);
    assert.equal(timeToMinutes(null), undefined);
    assert.equal(minutesToTime(570), "09:30");
    assert.equal(minutesToTime(0), "00:00");
    assert.equal(minutesToTime(null), undefined);
  });

  test("normaliseCityRaw accepts an array or the stored JSON string", () => {
    assert.deepEqual(normaliseCityRaw(["Tokyo"]), ["Tokyo"]);
    assert.deepEqual(normaliseCityRaw('["Osaka"]'), ["Osaka"]);
    assert.equal(normaliseCityRaw("not json"), null);
    assert.equal(normaliseCityRaw([]), null);
    assert.equal(normaliseCityRaw([1]), null);
    assert.equal(normaliseCityRaw(undefined), null);
  });
});

describe("mappers", () => {
  test("agenda item keeps the snake_case contract, HH:MM times and numeric coordinates", () => {
    const dto = toAgendaItemDto(agenda(1, 10) as never, []);
    assert.equal(dto.start_time, "09:30");
    assert.equal("end_time" in dto && dto.end_time !== undefined, false);
    assert.deepEqual(dto.coordinates, { lat: 35.6895, lng: 139.6917 });
    assert.equal(dto.list_type, "place");
    assert.equal(dto.budget, "20.00");
    assert.equal("record_status" in dto, false);
    assert.equal("created_dt" in dto, false);
    assert.equal(toAgendaItemDto(agenda(2, 10, { coordinates_lat: null }) as never, []).coordinates, undefined);
  });

  test("booking: remarks from location, price as number, pax breakdown parsed", () => {
    const dto = toBookingDto({
      id: 1,
      itinerary_id: 10,
      item: "Flight",
      location: "window",
      price: "99.90" as never,
      pax_breakdown: '{"A":50}',
      booked: 1,
      breakfast: 0,
      created_dt: 1,
      record_status: "A",
    });
    assert.equal(dto.remarks, "window");
    assert.equal(dto.price, 99.9);
    assert.deepEqual(dto.paxBreakdown, { A: 50 });
    assert.equal(dto.booked, true);
    assert.equal(dto.breakfast, false);
  });

  test("packing item defaults its category to misc", () => {
    const dto = toPackingItemDto({ id: 1, itinerary_id: 1, label: "x", packed: 0, sort_order: 0 } as never);
    assert.equal(dto.category, "misc");
    assert.equal(dto.quantity, undefined);
  });

  test("itinerary: no viewCount for the owner; corrupt pax_names reads as []", () => {
    const children = { agendaItems: [], bookings: [], packingItems: [], noteItems: [] };
    const owner = toItineraryDto(itinerary(10, ALICE, { pax_names: "{oops" }) as never, children);
    assert.deepEqual(owner.paxNames, []);
    assert.equal("viewCount" in owner, false);
  });

  test("public view drops the trip id, the owner's sessionId and child ids except agenda item ids", () => {
    const owner = toItineraryDto(itinerary(10, ALICE) as never, {
      agendaItems: [
        toAgendaItemDto(agenda(101, 10) as never, [
          { id: 501, uuid: "u", name: "a.jpg", mime_type: "image/jpeg", size_in_bytes: 1, tg_short_code: "aa11aa11" },
        ]),
      ],
      bookings: [toBookingDto({ id: 111, itinerary_id: 10, item: "Hotel", created_dt: 1, record_status: "A" })],
      packingItems: [toPackingItemDto({ id: 121, itinerary_id: 10, label: "Hat", packed: 0, sort_order: 0 } as never)],
      noteItems: [{ id: 131, label: "Visa", done: false }],
    });
    const pub = toPublicItineraryDto(owner, 7);
    assert.equal(pub.viewCount, 7);
    assert.equal("id" in pub, false);
    assert.equal("sessionId" in pub, false);
    assert.equal("challenge" in pub, false);
    assert.equal(pub.shortCode, "code10");
    assert.equal(pub.agendaItems[0].id, 101, "kept: fndom's ICS export uses it as the event UID");
    assert.equal("itinerary_id" in pub.agendaItems[0], false);
    assert.deepEqual(pub.agendaItems[0].files, [
      { uuid: "u", name: "a.jpg", mime_type: "image/jpeg", size_in_bytes: 1, tg_short_code: "aa11aa11" },
    ]);
    assert.equal("id" in pub.bookings[0] || "itineraryId" in pub.bookings[0], false);
    assert.equal(pub.bookings[0].item, "Hotel");
    assert.deepEqual(pub.packingItems, [{ label: "Hat", category: "misc", packed: false, quantity: undefined }]);
    assert.deepEqual(pub.noteItems, [{ label: "Visa", done: false }]);
    assert.equal(owner.id, 10, "the owner's DTO is not modified");
  });
});

// ─── Validators ────────────────────────────────────────────────────────────────

describe("validators", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (err) {
      return (err as { code?: string }).code;
    }
    return "no error";
  };

  test("create needs a sessionTitle within VARCHAR(512)", () => {
    assert.equal(
      code(() => validateCreateBody({})),
      "invalid_request_sessionTitle",
    );
    assert.equal(
      code(() => validateCreateBody({ sessionTitle: "   " })),
      "invalid_request_sessionTitle",
    );
    assert.equal(
      code(() => validateCreateBody({ sessionTitle: "x".repeat(513) })),
      "invalid_request_sessionTitle",
    );
    const body = validateCreateBody({ sessionTitle: " Japan ", idempotencyKey: "" });
    assert.equal(body.sessionTitle, "Japan");
    assert.equal(body.idempotencyKey, null);
    assert.deepEqual(body.agendaItems, []);
  });

  test("text fields are capped at their column widths", () => {
    assert.equal(
      code(() => validateBookingBody({ item: "x", remarks: "r".repeat(129) })),
      "invalid_request_remarks",
    );
    assert.equal(
      code(() => validateAgendaItemBody({ title: "t".repeat(513) })),
      "invalid_request_title",
    );
    assert.equal(
      code(() => validateAgendaItemBody({ category: "c".repeat(33) })),
      "invalid_request_category",
    );
    assert.equal(
      code(() => validateCreateBody({ sessionTitle: "x", packingItems: [{ label: "l".repeat(256) }] })),
      "invalid_request_label",
    );
  });

  test("files: image/* only, ids and names within their columns", () => {
    const withFile = (f: Row) => () => validateAgendaItemBody({ title: "x", _filesToInsert: [f] });
    assert.equal(code(withFile(imageFile("u1", { mimeType: "application/pdf" }))), "invalid_request_mimeType");
    assert.equal(code(withFile(imageFile("u1", { mimeType: "text/html" }))), "invalid_request_mimeType");
    assert.equal(code(withFile(imageFile("u1", { tgShortCode: "x".repeat(17) }))), "invalid_request_tgShortCode");
    assert.equal(code(withFile(imageFile("u".repeat(37)))), "invalid_request_uuid");
    assert.equal(code(withFile(imageFile("u1", { name: "n".repeat(256) }))), "invalid_request_name");
    assert.equal(code(withFile(imageFile("u1", { mimeType: undefined }))), "invalid_request_mimeType");
    assert.equal(code(withFile(imageFile("u1", { mimeType: "IMAGE/JPEG" }))), "no error");
  });

  test("agenda: accepts what the GET returned (snake_case, DECIMAL strings, 0/1 flags, string ids)", () => {
    const item = validateAgendaItemBody({
      id: "101",
      title: "Lunch",
      list_type: "place",
      start_time: "09:30",
      unknown_time: 1,
      duration_in_hours: "1.50",
      budget: "20.00",
      city_raw: '["Tokyo"]',
      coordinates: { lat: 35.6, lng: 139.7 },
    });
    assert.equal(item.id, 101);
    assert.equal(item.listType, "place");
    assert.equal(item.startTime, "09:30");
    assert.equal(item.unknownTime, true);
    assert.equal(item.durationInHours, 1.5);
    assert.equal(item.budget, 20);
    assert.deepEqual(item.cityRaw, ["Tokyo"]);
  });

  test("agenda: bad shapes are 400s", () => {
    assert.equal(
      code(() => validateAgendaItemBody({ listType: "other" })),
      "invalid_request_listType",
    );
    assert.equal(
      code(() => validateAgendaItemBody({ startTime: "9am" })),
      "invalid_request_startTime",
    );
    assert.equal(
      code(() => validateAgendaItemBody({ coordinates: { lat: 91, lng: 0 } })),
      "invalid_request_coordinates",
    );
    assert.equal(
      code(() => validateAgendaItemBody({ coordinates: { lat: 1 } })),
      "invalid_request_coordinates",
    );
    assert.equal(
      code(() => validateAgendaItemBody({ id: "abc" })),
      "invalid_request_agendaItems.id",
    );
    assert.equal(
      code(() => validateAgendaItemBody({ budget: 1e11 })),
      "invalid_request_budget",
    );
    assert.equal(
      code(() => validateAgendaItemBody({ unknownTime: "yes" })),
      "invalid_request_unknownTime",
    );
  });

  test("update: challenge undefined keeps, null clears; delete lists must be ids", () => {
    assert.equal(validateUpdateBody({}).challenge, undefined);
    assert.equal(validateUpdateBody({ challenge: null }).challenge, null);
    assert.equal(validateUpdateBody({ challenge: "" }).challenge, null);
    assert.equal(validateUpdateBody({ challenge: "654321" }).challenge, "654321");
    assert.equal(
      code(() => validateUpdateBody({ challenge: "1234567" })),
      "invalid_request_challenge",
    );
    assert.equal(validateUpdateBody({}).paxNames, undefined);
    assert.deepEqual(validateUpdateBody({ paxNames: null }).paxNames, []);
    assert.deepEqual(validateUpdateBody({ _bookingIdsToDelete: [1, "2"] }).bookingIdsToDelete, [1, 2]);
    assert.equal(
      code(() => validateUpdateBody({ _noteIdsToDelete: ["x"] })),
      "invalid_request__noteIdsToDelete",
    );
    assert.equal(
      code(() => validateUpdateBody({ agendaItems: "nope" })),
      "invalid_request_agendaItems",
    );
  });

  test("challenge body", () => {
    assert.deepEqual(validateChallengeBody({ shortCode: "abc", challenge: "123456" }), {
      shortCode: "abc",
      challenge: "123456",
    });
    assert.equal(
      code(() => validateChallengeBody({ challenge: "1" })),
      "invalid_request_shortCode",
    );
    assert.equal(
      code(() => validateChallengeBody({ shortCode: "abc" })),
      "invalid_request_challenge",
    );
    assert.equal(
      code(() => validateChallengeBody({ shortCode: "abc", challenge: "1234567" })),
      "invalid_request_challenge",
    );
  });
});

describe("column mappers: absent = unchanged, sent blank = NULL", () => {
  const agendaCols = (body: Row) => agendaColumns(validateAgendaItemBody(body));

  test("agenda: every nullable field sent blank becomes NULL", () => {
    const cols = agendaCols({
      category: "",
      listType: null,
      desc: "",
      city: "",
      cityRaw: [],
      coordinates: null,
      startTime: null,
      endTime: "",
      durationInHours: null,
      budget: null,
      day: null,
      date: "",
    });
    for (const column of [
      "category",
      "list_type",
      "desc",
      "city",
      "city_raw",
      "coordinates_lat",
      "coordinates_lng",
      "start_time",
      "end_time",
      "duration_in_hours",
      "budget",
      "day",
      "date",
    ] as const) {
      assert.equal(cols[column], null, column);
    }
  });

  test("agenda: absent fields are undefined (knex leaves the column alone)", () => {
    const cols = agendaCols({ id: 101 });
    assert.deepEqual(
      Object.entries(cols).filter(([, v]) => v !== undefined),
      [],
    );
  });

  test("agenda: 0 has always meant 'not set' for budget / duration / day", () => {
    const cols = agendaCols({ budget: 0, durationInHours: 0, day: 0 });
    assert.equal(cols.budget, null);
    assert.equal(cols.duration_in_hours, null);
    assert.equal(cols.day, null);
  });

  test("agenda: date cleared without a day → unscheduled (day NULL too); a day that was sent is kept", () => {
    const unscheduled = agendaCols({ date: "" });
    assert.equal(unscheduled.date, null);
    assert.equal(unscheduled.day, null);
    const undatedTripDay3 = agendaCols({ date: "", day: 3 });
    assert.equal(undatedTripDay3.date, null);
    assert.equal(undatedTripDay3.day, 3);
    assert.equal(agendaCols({ title: "x" }).day, undefined, "no date sent → day unchanged");
  });

  test("agenda: the camelCase field fndom edits wins over the GET's snake_case one, even when cleared", () => {
    const cleared = agendaCols({ startTime: null, start_time: "09:30", unknownTime: false, unknown_time: 1 });
    assert.equal(cleared.start_time, null);
    assert.equal(cleared.unknown_time, 0);
    assert.equal(agendaCols({ start_time: "09:30" }).start_time, 570);
    assert.equal(agendaCols({ cityRaw: [], city_raw: '["Tokyo"]' }).city_raw, null);
  });

  test("booking: blank → NULL, absent → unchanged; flags and sort order only when sent", () => {
    const cleared = bookingColumns(
      validateBookingBody({
        category: "",
        remarks: "",
        link: "",
        payment: null,
        startDate: null,
        endDate: null,
        nights: null,
        price: null,
        freeCancellation: "",
        deposit: "",
        paxBreakdown: {},
      }),
    );
    for (const column of [
      "category",
      "location",
      "link",
      "payment",
      "start_date",
      "end_date",
      "nights",
      "price",
      "free_cancellation",
      "deposit",
      "pax_breakdown",
    ] as const) {
      assert.equal(cleared[column], null, column);
    }
    const absent = bookingColumns(validateBookingBody({ id: 111 }));
    assert.deepEqual(
      Object.entries(absent).filter(([, v]) => v !== undefined),
      [],
    );
    const values = bookingColumns(validateBookingBody({ item: "x", nights: 0, price: 0, booked: false }));
    assert.equal(values.nights, 0);
    assert.equal(values.price, 0);
    assert.equal(values.booked, 0);
    assert.equal(bookingColumns(validateBookingBody({ sortOrder: null })).sort_order, 0);
  });

  test("packing: quantity cleared → NULL, absent → unchanged; blank category → misc", () => {
    const cleared = packingColumns(validatePackingItemBody({ quantity: null, category: "" }), 3);
    assert.equal(cleared.quantity, null);
    assert.equal(cleared.category, "misc");
    assert.equal(cleared.sort_order, 3);
    const absent = packingColumns(validatePackingItemBody({ id: 121 }), 0);
    assert.equal(absent.quantity, undefined);
    assert.equal(absent.category, undefined);
    assert.equal(absent.label, undefined);
    assert.equal(absent.packed, undefined);
  });

  test("note: category / url cleared → NULL, absent → unchanged", () => {
    const cleared = noteColumns(validateNoteItemBody({ category: "", url: null }), 0);
    assert.equal(cleared.category, null);
    assert.equal(cleared.url, null);
    const absent = noteColumns(validateNoteItemBody({ id: 131 }), 0);
    assert.equal(absent.category, undefined);
    assert.equal(absent.url, undefined);
    assert.equal(absent.done, undefined);
  });
});

// ─── HTTP (in-process; real MandatoryTokenFilter + rate limiter, DB lookups faked) ──

describe("HTTP /itinerary", () => {
  let server: Server;
  let base: string;
  let fake = fakeDb(seed());
  const tokens: Record<number, string> = {};
  const previousSecret = process.env.JWT_SECRET;
  let ipCounter = 0;
  /** Each test gets its own client IP so the challenge limiter's buckets don't leak between tests. */
  const freshIp = () => `10.0.0.${++ipCounter}`;

  before(async () => {
    process.env.JWT_SECRET = "test-secret";
    for (const id of [ALICE, BOB]) {
      tokens[id] = signToken({ id, username: `user${id}`, system: "fnd", roles: [], lastLoggedInDt: 0 });
    }
    mock.method(tokenFilterDb, "findOne", async (_t: string, where: { username_system: string }) => {
      const id = Number(where.username_system.replace(/^user(\d+)_fnd$/, "$1"));
      return { id, token: tokens[id], roles: "[]" };
    });

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    const fakeLogContext: RequestHandler = (req, _res, next) => {
      req.logContext = {
        requestId: "t",
        startTime: 0,
        method: req.method,
        path: req.path,
        ip: "",
        events: [],
      } as never;
      next();
    };
    app.use(fakeLogContext);
    // Re-read `fake` per request so tests can reset the data.
    app.use("/itinerary", (req, res, next) => createItineraryController(fake.db)(req, res, next));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/itinerary`;
  });

  after(async () => {
    mock.restoreAll();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const reset = () => {
    fake = fakeDb(seed());
  };

  const call = async (
    method: "GET" | "POST",
    path: string,
    opts: { user?: number; body?: unknown; ip?: string } = {},
  ) => {
    const headers: Record<string, string> = { "X-Real-IP": opts.ip ?? freshIp() };
    if (method === "POST") headers["Content-Type"] = "application/json";
    if (opts.user) {
      headers.Cookie = `jwt_token=${tokens[opts.user]}; csrf_token=csrf123`;
      headers["X-CSRF-Token"] = "csrf123";
    }
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
    });
    // Let fire-and-forget view inserts settle.
    await new Promise((resolve) => setImmediate(resolve));
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  const rowsOf = (table: string, itineraryId: number) =>
    fake.tables()[table].filter((r) => r.itinerary_id === itineraryId);
  /** Everything belonging to bob's trip 20, for "nothing changed" checks. */
  const bobsData = () =>
    structuredClone({
      itinerary: fake.tables().tb_travel_itinerary.find((r) => r.id === 20),
      agenda: rowsOf("tb_travel_agenda_item", 20),
      files: fake.tables().tb_travel_agenda_file.filter((f) => f.agenda_item_id === 201),
      bookings: rowsOf("tb_travel_itinerary_booking", 20),
      packing: rowsOf("tb_travel_packing_item", 20),
      notes: rowsOf("tb_travel_note_item", 20),
    });

  // ── Auth / ownership ──

  test("owner routes need a session: 401 without cookie", async () => {
    reset();
    assert.equal((await call("GET", "/")).status, 401);
    assert.equal((await call("GET", "/s10")).status, 401);
    assert.equal((await call("POST", "/", { body: { sessionTitle: "x" } })).status, 401);
    assert.equal((await call("POST", "/s10/update")).status, 401);
    assert.equal((await call("POST", "/s10/delete")).status, 401);
  });

  test("POST without the CSRF header → 403 csrf_invalid", async () => {
    reset();
    const res = await fetch(`${base}/s10/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `jwt_token=${tokens[ALICE]}; csrf_token=c` },
      body: "{}",
    });
    assert.equal(res.status, 403);
    assert.equal(fake.tables().tb_travel_itinerary.find((r) => r.id === 10)?.record_status, "A");
  });

  test("GET / lists only the caller's trips, camelCase, sharedTrips empty", async () => {
    reset();
    const { status, json } = await call("GET", "/", { user: ALICE });
    assert.equal(status, 200);
    assert.deepEqual(json.data.sharedTrips, []);
    assert.equal(json.data.myTrips.length, 1);
    assert.deepEqual(Object.keys(json.data.myTrips[0]).sort(), [
      "destination",
      "endDate",
      "id",
      "numberOfPax",
      "sessionId",
      "sessionTitle",
      "shortCode",
      "startDate",
    ]);
    assert.equal(json.data.myTrips[0].sessionId, "s10");
  });

  test("GET /:sessionId: own trip 200 (file metadata, no blob), someone else's 403, unknown 404", async () => {
    reset();
    const own = await call("GET", "/s10", { user: ALICE });
    assert.equal(own.status, 200);
    assert.equal(own.json.data.challenge, null);
    assert.equal(own.json.data.agendaItems[0].start_time, "09:30");
    assert.deepEqual(own.json.data.agendaItems[0].files, [
      {
        id: 501,
        uuid: "uuid-alice-1",
        name: "a.jpg",
        mime_type: "image/jpeg",
        size_in_bytes: 10,
        tg_short_code: "aa11aa11",
      },
    ]);
    assert.doesNotMatch(JSON.stringify(own.json), /SECRET-BLOB/);
    assert.equal(own.json.data.bookings[0].item, "Hotel A");
    assert.equal(own.json.data.packingItems[0].category, "misc");
    assert.equal("viewCount" in own.json.data, false);

    const other = await call("GET", "/s20", { user: ALICE });
    assert.equal(other.status, 403);
    assert.equal(other.json.data.code, "forbidden_access");
    assert.equal((await call("GET", "/nope", { user: ALICE })).status, 404);
  });

  // ── Public share ──

  test("GET /v/:shortCode: public trip shown + view recorded; protected trip only says hasChallenge", async () => {
    reset();
    const open = await call("GET", "/v/code10");
    assert.equal(open.status, 200);
    assert.equal(open.json.data.sessionTitle, "Trip 10");
    assert.equal(open.json.data.viewCount, 0);
    assert.equal("id" in open.json.data || "sessionId" in open.json.data, false, "no internal id / owner sessionId");
    assert.equal("challenge" in open.json.data, false);
    assert.equal(open.json.data.agendaItems[0].id, 101);
    assert.equal("id" in open.json.data.agendaItems[0].files[0], false);
    assert.equal("id" in open.json.data.bookings[0], false);
    assert.equal("id" in open.json.data.packingItems[0], false);
    assert.equal("id" in open.json.data.noteItems[0], false);
    assert.doesNotMatch(JSON.stringify(open.json), /"s10"/);
    assert.equal(fake.tables().tb_travel_itinerary_view.length, 1);
    assert.equal(fake.tables().tb_travel_itinerary_view[0].short_code, "code10");

    const locked = await call("GET", "/v/code20");
    assert.equal(locked.status, 200);
    assert.deepEqual(locked.json.data, { hasChallenge: true });
    assert.equal(fake.tables().tb_travel_itinerary_view.length, 1, "no view for a locked trip");
    assert.equal((await call("GET", "/v/missing")).status, 404);
  });

  test("POST /challenge: wrong code 400, right code returns the trip and counts a view", async () => {
    reset();
    const wrong = await call("POST", "/challenge", { body: { shortCode: "code20", challenge: "000000" } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json.data.code, "invalid_request_challenge");
    assert.equal(fake.tables().tb_travel_itinerary_view.length, 0);

    const right = await call("POST", "/challenge", { body: { shortCode: "code20", challenge: "123456" } });
    assert.equal(right.status, 200);
    assert.equal(right.json.data.sessionTitle, "Trip 20");
    assert.equal(right.json.data.agendaItems[0].files[0].tg_short_code, "bb22bb22");
    assert.equal("id" in right.json.data || "sessionId" in right.json.data, false);
    assert.equal("challenge" in right.json.data, false, "the access code is not echoed back");
    assert.equal("itineraryId" in right.json.data.bookings[0], false);
    assert.equal(fake.tables().tb_travel_itinerary_view.length, 1);

    assert.equal((await call("POST", "/challenge", { body: { shortCode: "nope", challenge: "1" } })).status, 404);
    assert.equal((await call("POST", "/challenge", { body: {} })).status, 400);
  });

  test("POST /challenge limiter: 10 failures per IP, then 429 even for the right code", async () => {
    reset();
    const ip = freshIp();
    for (let i = 0; i < 10; i++) {
      const r = await call("POST", "/challenge", { ip, body: { shortCode: "code20", challenge: "999999" } });
      assert.equal(r.status, 400);
    }
    const blocked = await call("POST", "/challenge", { ip, body: { shortCode: "code20", challenge: "123456" } });
    assert.equal(blocked.status, 429);
  });

  test("POST /challenge limiter: successful unlocks don't count", async () => {
    reset();
    const ip = freshIp();
    for (let i = 0; i < 12; i++) {
      const r = await call("POST", "/challenge", { ip, body: { shortCode: "code20", challenge: "123456" } });
      assert.equal(r.status, 200);
    }
  });

  // ── Create ──

  test("POST /: creates the trip and its children, returns agendaToFileMap in request order", async () => {
    reset();
    const { status, json } = await call("POST", "/", {
      user: ALICE,
      body: {
        sessionTitle: "New trip",
        idempotencyKey: "idem-1",
        challenge: "112233",
        paxNames: ["A"],
        agendaItems: [
          { title: "One", startTime: "10:00", _filesToInsert: [imageFile("new-1")] },
          { title: "Two", listType: "todo" },
        ],
        bookings: [{ item: "Flight", price: 100 }],
        packingItems: [{ label: "Hat" }, { label: "Shoes", category: "clothes" }],
        noteItems: [{ label: "Note" }],
      },
    });
    assert.equal(status, 200);
    assert.equal(json.data.agendaToFileMap.length, 2);
    assert.deepEqual(json.data.agendaToFileMap[0].fileUuids, ["new-1"]);
    assert.deepEqual(json.data.agendaToFileMap[1].fileUuids, []);

    const trip = fake.tables().tb_travel_itinerary.find((r) => r.session_id === json.data.sessionId)!;
    assert.equal(trip.created_by_id, ALICE);
    assert.equal(trip.challenge, "112233");
    assert.equal(trip.number_of_pax, 1);
    assert.equal(trip.pax_names, '["A"]');
    const items = rowsOf("tb_travel_agenda_item", trip.id);
    assert.deepEqual(
      items.map((i) => i.id),
      json.data.agendaToFileMap.map((m: Row) => m.agendaId),
    );
    assert.equal(items[0].start_time, 600);
    const file = fake.tables().tb_travel_agenda_file.find((f) => f.uuid === "new-1")!;
    assert.equal(file.agenda_item_id, items[0].id);
    assert.equal(file.mime_type, "image/png");
    assert.deepEqual(
      rowsOf("tb_travel_packing_item", trip.id).map((p) => [p.label, p.category, p.sort_order]),
      [
        ["Hat", "misc", 0],
        ["Shoes", "clothes", 1],
      ],
    );
    assert.equal(rowsOf("tb_travel_itinerary_booking", trip.id)[0].price, 100);
    assert.equal(rowsOf("tb_travel_note_item", trip.id).length, 1);

    // Same idempotency key → the same trip, nothing new.
    const tripCount = fake.tables().tb_travel_itinerary.length;
    const replay = await call("POST", "/", {
      user: ALICE,
      body: { sessionTitle: "New trip", idempotencyKey: "idem-1" },
    });
    assert.equal(replay.json.data.sessionId, json.data.sessionId);
    assert.equal(fake.tables().tb_travel_itinerary.length, tripCount);
    // Another user with the same key gets their own trip.
    const bobs = await call("POST", "/", { user: BOB, body: { sessionTitle: "Bob trip", idempotencyKey: "idem-1" } });
    assert.notEqual(bobs.json.data.sessionId, json.data.sessionId);
  });

  test("POST /: non-image file → 400 and nothing is stored", async () => {
    reset();
    const before = structuredClone(fake.tables());
    const { status, json } = await call("POST", "/", {
      user: ALICE,
      body: {
        sessionTitle: "x",
        agendaItems: [{ title: "a", _filesToInsert: [imageFile("u", { mimeType: "text/html" })] }],
      },
    });
    assert.equal(status, 400);
    assert.equal(json.data.code, "invalid_request_mimeType");
    assert.deepEqual(fake.tables(), before);
  });

  // ── Update: happy path ──

  test("POST /:sessionId/update: updates own children, inserts new ones, deletes listed ids", async () => {
    reset();
    const { status, json } = await call("POST", "/s10/update", {
      user: ALICE,
      body: {
        sessionTitle: "Renamed",
        challenge: "654321",
        agendaItems: [
          { id: "101", title: "Edited", start_time: "11:15", _filesToInsert: [imageFile("new-2")] },
          { title: "Brand new" },
        ],
        bookings: [{ id: 111, item: "Hotel A2" }, { item: "Car" }],
        packingItems: [
          { title: "ignored", label: "New first" },
          { id: 121, label: "Socks", packed: true },
        ],
        noteItems: [],
        _noteIdsToDelete: [131],
      },
    });
    assert.equal(status, 200);
    assert.equal(json.data.shortCode, "code10");
    assert.equal(json.data.agendaToFileMap[0].agendaId, 101);

    const trip = fake.tables().tb_travel_itinerary.find((r) => r.id === 10)!;
    assert.equal(trip.session_title, "Renamed");
    assert.equal(trip.challenge, "654321");
    assert.equal(trip.pax_names, '["A","B"]', "paxNames absent → unchanged");
    const edited = fake.tables().tb_travel_agenda_item.find((r) => r.id === 101)!;
    assert.equal(edited.title, "Edited");
    assert.equal(edited.start_time, 675);
    assert.equal(edited.date, "2026-12-01", "absent date keeps the stored value");
    assert.equal(edited.budget, "20.00", "absent budget keeps the stored value");
    assert.equal(fake.tables().tb_travel_agenda_file.find((f) => f.uuid === "new-2")?.agenda_item_id, 101);
    assert.equal(rowsOf("tb_travel_agenda_item", 10).length, 2);
    assert.equal(fake.tables().tb_travel_itinerary_booking.find((b) => b.id === 111)?.item, "Hotel A2");
    assert.equal(rowsOf("tb_travel_itinerary_booking", 10).length, 2);
    const socks = fake.tables().tb_travel_packing_item.find((p) => p.id === 121)!;
    assert.equal(socks.packed, 1);
    assert.equal(socks.sort_order, 1);
    assert.equal(fake.tables().tb_travel_note_item.find((n) => n.id === 131)?.record_status, "D");
  });

  test("POST /:sessionId/update: challenge null removes the access code, absent keeps it", async () => {
    reset();
    await call("POST", "/s10/update", { user: ALICE, body: { challenge: "111111" } });
    await call("POST", "/s10/update", { user: ALICE, body: {} });
    assert.equal(fake.tables().tb_travel_itinerary.find((r) => r.id === 10)?.challenge, "111111");
    await call("POST", "/s10/update", { user: ALICE, body: { challenge: null } });
    assert.equal(fake.tables().tb_travel_itinerary.find((r) => r.id === 10)?.challenge, null);
  });

  test("old paths /edit/:sessionId and /delete/:sessionId are gone", async () => {
    reset();
    assert.equal((await call("POST", "/edit/s10", { user: ALICE })).status, 404);
    assert.equal((await call("POST", "/delete/s10", { user: ALICE })).status, 404);
    assert.equal((await call("POST", "/add-collaborator", { user: ALICE })).status, 404);
  });

  // ── Update: another trip's children (must never change) ──

  test("someone else's trip: update and delete are 403 and change nothing", async () => {
    reset();
    const before = bobsData();
    const upd = await call("POST", "/s20/update", { user: ALICE, body: { sessionTitle: "pwned", challenge: null } });
    assert.equal(upd.status, 403);
    assert.equal((await call("POST", "/s20/delete", { user: ALICE })).status, 403);
    assert.deepEqual(bobsData(), before);
  });

  test("foreign agenda item id → 403, whole save rejected (own trip untouched too)", async () => {
    reset();
    const before = structuredClone(fake.tables());
    const { status, json } = await call("POST", "/s10/update", {
      user: ALICE,
      body: { sessionTitle: "Should not apply", agendaItems: [{ id: 201, title: "pwned" }] },
    });
    assert.equal(status, 403);
    assert.equal(json.data.code, "forbidden_access");
    assert.deepEqual(fake.tables(), before);
  });

  test("foreign agenda item id carrying files → 403, no file attached", async () => {
    reset();
    const before = structuredClone(fake.tables());
    const { status } = await call("POST", "/s10/update", {
      user: ALICE,
      body: { agendaItems: [{ id: 201, title: "x", _filesToInsert: [imageFile("sneaky")] }] },
    });
    assert.equal(status, 403);
    assert.deepEqual(fake.tables(), before);
  });

  test("re-attaching another trip's file uuid to an own item is skipped", async () => {
    reset();
    const before = bobsData();
    const { status } = await call("POST", "/s10/update", {
      user: ALICE,
      body: { agendaItems: [{ id: 101, title: "x", _filesToInsert: [imageFile("uuid-bob-1")] }] },
    });
    assert.equal(status, 200);
    assert.deepEqual(bobsData(), before);
    assert.equal(fake.tables().tb_travel_agenda_file.filter((f) => f.uuid === "uuid-bob-1").length, 1);
  });

  // Every child type, in an update and in its delete list: 403 and the whole DB unchanged
  // (including a legitimate rename sent in the same request).
  const foreignCases: [string, Row][] = [
    ["agenda delete", { _agendaIdsToDelete: [201] }],
    ["booking update", { bookings: [{ id: 211, item: "pwned" }] }],
    ["booking delete", { _bookingIdsToDelete: [211] }],
    ["packing update", { packingItems: [{ id: 221, label: "pwned" }] }],
    ["packing delete", { _packingIdsToDelete: [221] }],
    ["note update", { noteItems: [{ id: 231, label: "pwned" }] }],
    ["note delete", { _noteIdsToDelete: [231] }],
    [
      "own + foreign mixed",
      {
        bookings: [
          { id: 111, item: "ok" },
          { id: 211, item: "pwned" },
        ],
      },
    ],
  ];
  for (const [label, payload] of foreignCases) {
    test(`foreign id (${label}) → 403, nothing written`, async () => {
      reset();
      const before = structuredClone(fake.tables());
      const { status, json } = await call("POST", "/s10/update", {
        user: ALICE,
        body: { sessionTitle: "Should not apply", ...payload },
      });
      assert.equal(status, 403);
      assert.equal(json.data.code, "forbidden_access");
      assert.deepEqual(fake.tables(), before);
    });
  }

  test("own soft-deleted child ids still count as this trip's", async () => {
    reset();
    fake.tables().tb_travel_itinerary_booking.find((b) => b.id === 111)!.record_status = "D";
    const { status } = await call("POST", "/s10/update", { user: ALICE, body: { _bookingIdsToDelete: [111] } });
    assert.equal(status, 200);
  });

  // ── Image ownership (tb_tg_image.created_by_id) ──

  const withImage = (tgShortCode: string, id?: number) => ({
    agendaItems: [
      { ...(id ? { id } : {}), title: "x", _filesToInsert: [imageFile(`f-${tgShortCode}`, { tgShortCode })] },
    ],
  });

  test("attaching someone else's upload → 403 before anything is written (create and update)", async () => {
    reset();
    const before = structuredClone(fake.tables());
    const upd = await call("POST", "/s10/update", {
      user: ALICE,
      body: { sessionTitle: "nope", ...withImage("bb22bb22", 101) },
    });
    assert.equal(upd.status, 403);
    assert.equal(upd.json.data.code, "forbidden_access");
    const created = await call("POST", "/", { user: ALICE, body: { sessionTitle: "nope", ...withImage("bb22bb22") } });
    assert.equal(created.status, 403);
    assert.deepEqual(fake.tables(), before);
  });

  test("unknown or deleted short code → 400 invalid_request_tgShortCode, nothing written", async () => {
    reset();
    const before = structuredClone(fake.tables());
    for (const code of ["ffff0000", "ee55ee55"]) {
      const { status, json } = await call("POST", "/s10/update", { user: ALICE, body: withImage(code, 101) });
      assert.equal(status, 400, code);
      assert.equal(json.data.code, "invalid_request_tgShortCode");
    }
    assert.deepEqual(fake.tables(), before);
  });

  test("own uploads and legacy uploads (no created_by_id) can be attached", async () => {
    reset();
    for (const code of ["cc33cc33", "dd44dd44"]) {
      const { status } = await call("POST", "/s10/update", { user: ALICE, body: withImage(code, 101) });
      assert.equal(status, 200, code);
      assert.equal(fake.tables().tb_travel_agenda_file.find((f) => f.tg_short_code === code)?.agenda_item_id, 101);
    }
    // The legacy image is attachable by bob too.
    const bobs = await call("POST", "/s20/update", { user: BOB, body: withImage("dd44dd44", 201) });
    assert.equal(bobs.status, 200);
  });

  // ── Update: absent = unchanged, sent blank = NULL ──

  test("agenda: clearing fields stores NULL; moving an item back to unscheduled clears day and date", async () => {
    reset();
    const { status } = await call("POST", "/s10/update", {
      user: ALICE,
      // What fndom sends after "unschedule" + clearing the place, time and budget in the drawer:
      // the GET's snake_case fields plus the edited camelCase ones; `day` is undefined (dropped).
      body: {
        agendaItems: [
          {
            ...agenda(101, 10, { day: undefined, start_time: "09:30" }),
            date: "",
            city: "",
            cityRaw: [],
            coordinates: null,
            startTime: null,
            budget: null,
          },
        ],
      },
    });
    assert.equal(status, 200);
    const row = fake.tables().tb_travel_agenda_item.find((r) => r.id === 101)!;
    assert.equal(row.date, null);
    assert.equal(row.day, null);
    assert.equal(row.coordinates_lat, null);
    assert.equal(row.coordinates_lng, null);
    assert.equal(row.start_time, null);
    assert.equal(row.budget, null);
    assert.equal(row.title, "Agenda 101", "round-tripped values are written unchanged");
    assert.equal(row.category, "food");
  });

  test("agenda: an item sent with only its id changes nothing", async () => {
    reset();
    const before = structuredClone(fake.tables().tb_travel_agenda_item);
    const { status } = await call("POST", "/s10/update", { user: ALICE, body: { agendaItems: [{ id: 101 }] } });
    assert.equal(status, 200);
    assert.deepEqual(fake.tables().tb_travel_agenda_item, before);
  });

  test("booking / packing / note: cleared → NULL, absent → unchanged", async () => {
    reset();
    Object.assign(
      fake.tables().tb_travel_itinerary_booking.find((b) => b.id === 111)!,
      {
        location: "Shinjuku",
        payment: "Instant",
        price: "100.00",
        deposit: "50",
      },
    );
    Object.assign(
      fake.tables().tb_travel_packing_item.find((p) => p.id === 121)!,
      { quantity: 3, category: "clothes" },
    );
    Object.assign(
      fake.tables().tb_travel_note_item.find((n) => n.id === 131)!,
      { url: "https://x", category: "docs" },
    );

    const { status } = await call("POST", "/s10/update", {
      user: ALICE,
      body: {
        bookings: [{ id: 111, item: "Hotel A", remarks: "", payment: null }],
        packingItems: [{ id: 121, label: "Socks", quantity: null }],
        noteItems: [{ id: 131, label: "Visa", url: "" }],
      },
    });
    assert.equal(status, 200);
    const booking = fake.tables().tb_travel_itinerary_booking.find((b) => b.id === 111)!;
    assert.equal(booking.location, null);
    assert.equal(booking.payment, null);
    assert.equal(booking.price, "100.00", "absent price unchanged");
    assert.equal(booking.deposit, "50");
    assert.equal(booking.booked, 1, "absent flag unchanged");
    const packing = fake.tables().tb_travel_packing_item.find((p) => p.id === 121)!;
    assert.equal(packing.quantity, null);
    assert.equal(packing.category, "clothes");
    const note = fake.tables().tb_travel_note_item.find((n) => n.id === 131)!;
    assert.equal(note.url, null);
    assert.equal(note.category, "docs");
  });

  test("trip: destination / country cleared → NULL; absent pax count and duration unchanged", async () => {
    reset();
    const { status } = await call("POST", "/s10/update", { user: ALICE, body: { destination: "", country: null } });
    assert.equal(status, 200);
    const trip = fake.tables().tb_travel_itinerary.find((r) => r.id === 10)!;
    assert.equal(trip.destination, null);
    assert.equal(trip.country, null);
    assert.equal(trip.number_of_pax, 2);
    assert.equal(trip.duration_in_days, 3);
    assert.equal(trip.destination_raw, '["Tokyo"]');
    assert.equal(trip.start_date, 1_700_000_000_000);
  });

  // ── Delete ──

  test("POST /:sessionId/delete: owner soft-deletes; then 404", async () => {
    reset();
    const { status, json } = await call("POST", "/s10/delete", { user: ALICE });
    assert.equal(status, 200);
    assert.deepEqual(json.data, { deleted: true });
    assert.equal(fake.tables().tb_travel_itinerary.find((r) => r.id === 10)?.record_status, "D");
    assert.equal((await call("GET", "/s10", { user: ALICE })).status, 404);
    assert.equal((await call("GET", "/v/code10")).status, 404);
  });
});
