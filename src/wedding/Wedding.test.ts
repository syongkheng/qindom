import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import createWeddingController from "./Wedding.controller.js";
import {
  guestMailRecipients,
  randomPin,
  replacedRsvp,
  toStatusMatchDto,
  WEDDING_PDPA_NOTICE,
  WeddingService,
} from "./Wedding.service.js";
import {
  MAX_ADDITIONAL_GUESTS,
  sanitiseVisitBody,
  validatePreflightBody,
  validateRsvpBody,
  validateStatusQuery,
} from "./Wedding.validator.js";
import { renderReplacedNotice, rsvpConfirmationMail, rsvpGuestMail } from "./Wedding.emailTemplate.js";
import { buildEventLinks, buildRsvpUpdateLink } from "./Wedding.eventLinks.js";
import { parseUserAgent, renderVisitMessage, WeddingVisitNotifier } from "./Wedding.visitNotifier.js";
import { WeddingRsvpBody } from "./Wedding.types.js";
import { MailerUtilities, MailOptions } from "../utils/MailerUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

// ── Nothing leaves the machine ────────────────────────────────────────────────
// Importing the controller pulls in config/db/mysql.ts, which runs dotenv; override what it may have loaded.
process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = "";
process.env.WEDDING_WEBSITE_URL = "https://wedding.example/?q=0&x=<y>";

const sent: MailOptions[] = [];
MailerUtilities.sendMail = async (mail: MailOptions) => {
  sent.push(mail);
};

type FetchArgs = { url: string; init?: RequestInit };
const outbound: FetchArgs[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  outbound.push({ url, init });
  return new Response("{}", { status: 200 });
}) as typeof fetch;

// ── Fake DB (the KnexSqlUtilities calls WeddingService makes) ─────────────────
type Row = Record<string, any>;
const RSVP = "tb_wedding_rsvp";
const GUEST = "tb_wedding_rsvp_guest";

function fakeDb(seed: { rsvps?: Row[]; guests?: Row[] } = {}) {
  const tables: Record<string, Row[]> = { [RSVP]: seed.rsvps ?? [], [GUEST]: seed.guests ?? [] };
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  let nextId = 100;
  const db = {
    async find(table: string, where: Row, opts: { limit?: number; extraWhere?: (qb: unknown) => void } = {}) {
      let rows = tables[table].filter((r) => matches(r, where));
      opts.extraWhere?.({
        whereRaw(sql: string, [email]: string[]) {
          assert.equal(sql, "LOWER(email) = LOWER(?)");
          rows = rows.filter((r) => (r.email ?? "").toLowerCase() === email.toLowerCase());
        },
      });
      return (opts.limit ? rows.slice(0, opts.limit) : rows).map((r) => ({ ...r })); // copies, like a real result set
    },
    async findOne(table: string, where: Row) {
      return tables[table].find((r) => matches(r, where));
    },
    async insert(table: string, data: Row) {
      const row = { id: nextId++, ...data };
      tables[table].push(row);
      return row;
    },
    async update(table: string, where: Row, data: Row) {
      const hit = tables[table].filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return hit;
    },
  };
  return { db: db as never, rsvps: tables[RSVP], guests: tables[GUEST] };
}

const rsvpRow = (extra: Row = {}): Row => ({
  id: 1,
  pin: "1234",
  name: "Jonathan Tan",
  email: "jon@example.com",
  attending: 1,
  record_status: "A",
  created_dt: 1000,
  updated_dt: 2000,
  ...extra,
});

const validBody = {
  name: " Jonathan Tan ",
  email: " Jon@Example.com ",
  attending: true,
  contactNumber: "+65 9123 4567",
  dietaryRestrictions: null,
  mealPreference: "vegetarian",
  message: "  Congrats!  ",
  additionalGuestContact: [
    {
      name: "Mary Lee",
      email: "mary@example.com",
      contactNumber: null,
      dietaryRestrictions: null,
      mealPreference: "halal",
    },
  ],
};

const rejectsField = (fn: () => unknown, field: string) =>
  assert.throws(fn, (err: InstanceType<typeof Exceptions.InvalidRequest>) => err.fieldName === field, field);

beforeEach(() => {
  sent.length = 0;
  outbound.length = 0;
});

after(() => {
  globalThis.fetch = realFetch;
});

// ── Validators ────────────────────────────────────────────────────────────────

test("validateRsvpBody trims, turns blanks into null and keeps the jessikheng field names", () => {
  assert.deepEqual(validateRsvpBody({ ...validBody, dietaryRestrictions: "  " }), {
    name: "Jonathan Tan",
    email: "Jon@Example.com",
    contactNumber: "+65 9123 4567",
    attending: true,
    dietaryRestrictions: null,
    mealPreference: "vegetarian",
    message: "Congrats!",
    additionalGuestContact: [
      {
        name: "Mary Lee",
        email: "mary@example.com",
        contactNumber: null,
        dietaryRestrictions: null,
        mealPreference: "halal",
      },
    ],
  });
  assert.deepEqual(validateRsvpBody({ name: "A", email: "a@b.co", attending: false }).additionalGuestContact, []);
});

test("validateRsvpBody rejects missing / malformed fields with the field name", () => {
  rejectsField(() => validateRsvpBody({ ...validBody, name: "  " }), "name");
  rejectsField(() => validateRsvpBody({ ...validBody, email: "nope" }), "email");
  rejectsField(() => validateRsvpBody({ ...validBody, attending: "yes" }), "attending");
  rejectsField(() => validateRsvpBody({ ...validBody, contactNumber: "abc" }), "contactNumber");
  rejectsField(() => validateRsvpBody({ ...validBody, additionalGuestContact: "Mary" }), "additionalGuestContact");
  rejectsField(() => validateRsvpBody({ ...validBody, additionalGuestContact: [null] }), "additionalGuestContact[0]");
  rejectsField(
    () => validateRsvpBody({ ...validBody, additionalGuestContact: [{ name: "" }] }),
    "additionalGuestContact[0].name",
  );
  rejectsField(
    () => validateRsvpBody({ ...validBody, additionalGuestContact: [{ name: "B", email: "bad" }] }),
    "additionalGuestContact[0].email",
  );
  rejectsField(() => validateRsvpBody(undefined), "name");
});

test("validateRsvpBody caps strings at the column widths and guests at 10", () => {
  rejectsField(() => validateRsvpBody({ ...validBody, name: "x".repeat(256) }), "name");
  rejectsField(() => validateRsvpBody({ ...validBody, email: `${"x".repeat(250)}@b.com` }), "email");
  rejectsField(() => validateRsvpBody({ ...validBody, dietaryRestrictions: "x".repeat(101) }), "dietaryRestrictions");
  rejectsField(() => validateRsvpBody({ ...validBody, mealPreference: "x".repeat(101) }), "mealPreference");
  rejectsField(() => validateRsvpBody({ ...validBody, message: "x".repeat(1001) }), "message");
  assert.equal(validateRsvpBody({ ...validBody, message: "x".repeat(1000) }).message?.length, 1000);
  rejectsField(
    () => validateRsvpBody({ ...validBody, additionalGuestContact: [{ name: "B", mealPreference: "x".repeat(101) }] }),
    "additionalGuestContact[0].mealPreference",
  );

  const guests = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Guest ${i}` }));
  assert.equal(
    validateRsvpBody({ ...validBody, additionalGuestContact: guests(MAX_ADDITIONAL_GUESTS) }).additionalGuestContact
      .length,
    10,
  );
  rejectsField(
    () => validateRsvpBody({ ...validBody, additionalGuestContact: guests(MAX_ADDITIONAL_GUESTS + 1) }),
    "additionalGuestContact",
  );
});

test("validatePreflightBody and validateStatusQuery", () => {
  assert.deepEqual(validatePreflightBody({ email: " a@b.co " }), { email: "a@b.co" });
  rejectsField(() => validatePreflightBody({}), "email");
  rejectsField(() => validatePreflightBody({ email: "a@b" }), "email");

  assert.deepEqual(validateStatusQuery({ name: " Mary ", pin: "0042" }), { name: "Mary", pin: "0042" });
  rejectsField(() => validateStatusQuery({ pin: "0042" }), "name");
  rejectsField(() => validateStatusQuery({ name: " ", pin: "0042" }), "name");
  rejectsField(() => validateStatusQuery({ name: "Mary" }), "pin");
  rejectsField(() => validateStatusQuery({ name: "Mary", pin: "123" }), "pin");
  rejectsField(() => validateStatusQuery({ name: "Mary", pin: ["1234", "5678"] }), "pin");
  rejectsField(() => validateStatusQuery({ name: ["a", "b"], pin: "1234" }), "name");
});

test("sanitiseVisitBody clips and never throws", () => {
  assert.deepEqual(sanitiseVisitBody(undefined), { language: "", timezone: "", screen: "", referrer: "", path: "" });
  const clipped = sanitiseVisitBody({ language: " en-SG ", referrer: "r".repeat(500), path: 5, screen: { x: 1 } });
  assert.equal(clipped.language, "en-SG");
  assert.equal(clipped.referrer.length, 200);
  assert.equal(clipped.path, "");
  assert.equal(clipped.screen, "");
});

// ── Pure helpers ──────────────────────────────────────────────────────────────

test("randomPin is 4 digits with leading zeros", () => {
  assert.equal(
    randomPin(() => 0),
    "0000",
  );
  assert.equal(
    randomPin(() => 0.0042),
    "0042",
  );
  assert.equal(
    randomPin(() => 0.99999),
    "9999",
  );
  assert.match(randomPin(), /^\d{4}$/);
});

test("replacedRsvp: own RSVP wins and reports the latest save; guest entry next; else null", () => {
  assert.deepEqual(
    replacedRsvp(
      [
        { created_dt: 1, updated_dt: 50 },
        { created_dt: 10, updated_dt: 30 },
      ],
      3,
    ),
    { kind: "own", at: 50 },
  );
  assert.deepEqual(replacedRsvp([], 1), { kind: "guest" });
  assert.equal(replacedRsvp([], 0), null);
});

test("toStatusMatchDto masks every name and exposes no id", () => {
  const dto = toStatusMatchDto(rsvpRow() as never, ["Mary Lee", "YK"], "Mary Lee");
  assert.deepEqual(dto, {
    pin: "1234",
    name: "Jonathan ***",
    attending: true,
    additionalGuestNames: ["Mary ***", "Y*"],
    matchedGuestName: "Mary ***",
    createdAt: 1000,
    updatedAt: 2000,
  });
  assert.equal("matchedGuestName" in toStatusMatchDto(rsvpRow() as never, []), false);
  assert.equal("id" in dto, false);
});

test("guestMailRecipients skips guests without email, the submitter's own address and repeats", () => {
  const rsvp = validateRsvpBody({
    ...validBody,
    additionalGuestContact: [
      { name: "A", email: "a@x.com" },
      { name: "B" },
      { name: "Self", email: "JON@example.com" },
      { name: "A again", email: "A@X.com" },
      { name: "C", email: "c@x.com" },
    ],
  });
  assert.deepEqual(
    guestMailRecipients(rsvp).map((r) => [r.guest.name, r.to]),
    [
      ["A", "a@x.com"],
      ["C", "c@x.com"],
    ],
  );
});

// ── Service ───────────────────────────────────────────────────────────────────

describe("WeddingService.submitRsvp", () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  test("first RSVP: new row + guests, new pin, confirmation + guest email, no tamper alert", async () => {
    const { db, rsvps, guests } = fakeDb();
    const result = await new WeddingService(db, () => "0042").submitRsvp(validateRsvpBody(validBody));
    await flush();

    assert.deepEqual(result, { pin: "0042", notice: WEDDING_PDPA_NOTICE });
    assert.equal(rsvps.length, 1);
    assert.equal(rsvps[0].pin, "0042");
    assert.equal(rsvps[0].attending, 1);
    assert.equal(rsvps[0].message, "Congrats!");
    assert.equal(rsvps[0].record_status, "A");
    assert.equal(guests.length, 1);
    assert.equal(guests[0].rsvp_id, rsvps[0].id);

    assert.deepEqual(
      sent.map((m) => m.to),
      ["Jon@Example.com", "mary@example.com"],
    );
    assert.ok(!sent[0].html!.includes("Your RSVP was updated"));
  });

  test("re-submitting an email soft-deletes the old RSVP + its guests (any case) and warns with the old save time", async () => {
    const savedAt = Date.UTC(2026, 10, 3, 6, 5); // 14:05 SGT
    const { db, rsvps, guests } = fakeDb({
      rsvps: [rsvpRow({ id: 1, email: "JON@example.com", updated_dt: savedAt })],
      guests: [{ id: 7, rsvp_id: 1, name: "Old Guest", email: null, record_status: "A" }],
    });
    const result = await new WeddingService(db, () => "5555").submitRsvp(validateRsvpBody(validBody));
    await flush();

    assert.equal(result.pin, "5555");
    assert.equal(rsvps.find((r) => r.id === 1)!.record_status, "D");
    assert.equal(typeof rsvps.find((r) => r.id === 1)!.updated_dt, "number");
    assert.notEqual(rsvps.find((r) => r.id === 1)!.updated_dt, savedAt);
    assert.equal(guests.find((g) => g.id === 7)!.record_status, "D");
    assert.equal(rsvps.filter((r) => r.record_status === "A").length, 1);

    const html = sent[0].html!;
    assert.match(html, /Your RSVP was updated/);
    assert.match(html, /3 Nov 2026, 14:05 \(SGT\)/);
  });

  test("an email that was someone's guest: that guest entry is soft-deleted and the alert says so", async () => {
    const { db, guests } = fakeDb({
      rsvps: [rsvpRow({ id: 1, email: "other@example.com" })],
      guests: [{ id: 9, rsvp_id: 1, name: "Jonathan Tan", email: "jon@EXAMPLE.com", record_status: "A" }],
    });
    await new WeddingService(db, () => "1111").submitRsvp(validateRsvpBody(validBody));
    await flush();

    assert.equal(guests.find((g) => g.id === 9)!.record_status, "D");
    assert.match(sent[0].html!, /previously listed as a guest on another RSVP/);
  });

  test("pin generation retries past taken pins (including deleted rows)", async () => {
    const { db, rsvps } = fakeDb({
      rsvps: [
        rsvpRow({ id: 1, pin: "1111", email: "a@x.com", record_status: "D" }),
        rsvpRow({ id: 2, pin: "2222", email: "b@x.com" }),
      ],
    });
    const pins = ["1111", "2222", "3333"];
    const result = await new WeddingService(db, () => pins.shift()!).submitRsvp(validateRsvpBody(validBody));
    assert.equal(result.pin, "3333");
    assert.equal(rsvps.at(-1)!.pin, "3333");
  });

  test("pin generation gives up after 20 taken pins with entity_creation_failed", async () => {
    const { db } = fakeDb({ rsvps: [rsvpRow({ pin: "1234", email: "a@x.com" })] });
    let calls = 0;
    await assert.rejects(
      new WeddingService(db, () => {
        calls++;
        return "1234";
      }).submitRsvp(validateRsvpBody(validBody)),
      (err: InstanceType<typeof Exceptions.EntityCreation>) => err.code === "entity_creation_failed",
    );
    assert.equal(calls, 20);
  });

  test("a failing mail never fails the RSVP", async () => {
    const original = MailerUtilities.sendMail;
    MailerUtilities.sendMail = async () => {
      throw new Error("smtp down");
    };
    try {
      const { db, rsvps } = fakeDb();
      const result = await new WeddingService(db, () => "7777").submitRsvp(validateRsvpBody(validBody));
      await flush();
      assert.equal(result.pin, "7777");
      assert.equal(rsvps.length, 1);
    } finally {
      MailerUtilities.sendMail = original;
    }
  });
});

describe("WeddingService lookups", () => {
  const seed = () =>
    fakeDb({
      rsvps: [
        rsvpRow({ id: 1, pin: "1234" }),
        rsvpRow({ id: 2, pin: "9999", name: "Gone", email: "gone@x.com", record_status: "D" }),
      ],
      guests: [
        { id: 5, rsvp_id: 1, name: "Mary Lee", email: "mary@example.com", record_status: "A" },
        { id: 6, rsvp_id: 1, name: "Removed Guest", email: "removed@example.com", record_status: "D" },
      ],
    });

  test("status needs the pin AND a name on it (case/space-insensitive); names masked", async () => {
    const svc = new WeddingService(seed().db);
    const own = await svc.findRsvpStatus({ name: "jonathan TAN", pin: "1234" });
    assert.equal(own?.name, "Jonathan ***");
    assert.deepEqual(own?.additionalGuestNames, ["Mary ***"]);
    assert.equal(own && "matchedGuestName" in own, false);

    const viaGuest = await svc.findRsvpStatus({ name: " mary lee", pin: "1234" });
    assert.equal(viaGuest?.matchedGuestName, "Mary ***");

    assert.equal(await svc.findRsvpStatus({ name: "Someone Else", pin: "1234" }), null);
    assert.equal(await svc.findRsvpStatus({ name: "Removed Guest", pin: "1234" }), null);
    assert.equal(await svc.findRsvpStatus({ name: "Jonathan Tan", pin: "0000" }), null);
    assert.equal(await svc.findRsvpStatus({ name: "Gone", pin: "9999" }), null);
  });

  test("preflight finds registrants and guests (case-insensitive), ignores deleted rows", async () => {
    const svc = new WeddingService(seed().db);
    assert.deepEqual(await svc.checkRsvpExistsByEmail("JON@example.com"), { exists: true, hasEmail: true });
    assert.deepEqual(await svc.checkRsvpExistsByEmail("Mary@Example.com"), { exists: true, hasEmail: true });
    assert.deepEqual(await svc.checkRsvpExistsByEmail("gone@x.com"), { exists: false, hasEmail: false });
    assert.deepEqual(await svc.checkRsvpExistsByEmail("removed@example.com"), { exists: false, hasEmail: false });
  });
});

// ── Emails ────────────────────────────────────────────────────────────────────

describe("emails escape every user string", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const rsvp: WeddingRsvpBody = {
    name: `Eve ${evil}`,
    email: "eve@example.com",
    contactNumber: "+65 9123 4567",
    attending: true,
    dietaryRestrictions: null,
    mealPreference: `custom ${evil}`,
    message: `hi ${evil}`,
    additionalGuestContact: [
      {
        name: `Guest ${evil}`,
        email: "g@example.com",
        contactNumber: null,
        dietaryRestrictions: null,
        mealPreference: evil,
      },
    ],
  };

  test("confirmation", () => {
    const mail = rsvpConfirmationMail(rsvp, null);
    assert.equal(mail.to, "eve@example.com");
    assert.ok(!mail.html!.includes("<img"));
    assert.ok(mail.html!.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.match(mail.subject, /see you there/);
    assert.ok(mail.html!.includes("Add to Calendar"));
    // Env URL (with `<` in it) is escaped into the href and its q is overridden.
    assert.ok(mail.html!.includes('href="https://wedding.example/?q=2&amp;x=%3Cy%3E"'));
  });

  test("guest mail: escaped body, single-line subject", () => {
    const mail = rsvpGuestMail({ ...rsvp, name: "Eve\r\nBcc: x@y.z" }, rsvp.additionalGuestContact[0], "g@example.com");
    assert.equal(mail.to, "g@example.com");
    assert.ok(!mail.subject.includes("\n") && !mail.subject.includes("\r"));
    assert.ok(!mail.html!.includes("<img"));
  });

  test("declined RSVP has no event buttons; known meals get labels", () => {
    const declined = rsvpConfirmationMail({ ...rsvp, attending: false, additionalGuestContact: [] }, null);
    assert.ok(!declined.html!.includes("Add to Calendar"));
    assert.ok(!declined.html!.includes("Meal preference"));
    assert.ok(rsvpConfirmationMail({ ...rsvp, mealPreference: "regular" }, null).html!.includes("No restrictions"));
  });

  test("replaced notice: own with/without time, guest", () => {
    assert.match(renderReplacedNotice({ kind: "own", at: Date.UTC(2026, 0, 2, 16, 0) }), /3 Jan 2026, 00:00 \(SGT\)/);
    assert.match(renderReplacedNotice({ kind: "own", at: 0 }), /previously recorded for this email\./);
    assert.match(renderReplacedNotice({ kind: "guest" }), /listed as a guest/);
  });

  test("event links", () => {
    const links = buildEventLinks();
    assert.match(links.calendar, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    assert.match(links.directions, /destination=SAFRA/);
    assert.equal(links.website, "https://wedding.example/?q=1&x=%3Cy%3E");
    const previous = process.env.WEDDING_WEBSITE_URL;
    process.env.WEDDING_WEBSITE_URL = "not a url";
    assert.equal(buildRsvpUpdateLink(), null);
    process.env.WEDDING_WEBSITE_URL = previous;
  });
});

// ── Visit notifier ────────────────────────────────────────────────────────────

describe("visit notifier", () => {
  const visit = {
    ...sanitiseVisitBody({ language: "en", referrer: "<b>x</b>", path: "/#/rsvp" }),
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) WhatsApp/2.0 Mobile",
  };

  test("user agent parsing", () => {
    assert.deepEqual(parseUserAgent(visit.userAgent), { device: "Mobile", os: "iOS", browser: "WhatsApp" });
    assert.deepEqual(parseUserAgent(""), { device: "Desktop", os: "Unknown OS", browser: "Unknown browser" });
  });

  test("message escapes visitor values and drops empty lines", () => {
    const text = renderVisitMessage(visit);
    assert.ok(text.includes("&lt;b&gt;x&lt;/b&gt;"));
    assert.ok(!text.includes("Screen:"));
    assert.ok(!text.includes("\n\n\n"));
  });

  test("no bot token → nothing sent", async () => {
    await new WeddingVisitNotifier(fakeDb().db).notify(visit);
    assert.equal(outbound.length, 0);
  });

  test("sends to every subscribed chat; a failing DB never throws", async () => {
    process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = "test-token";
    try {
      const db = { raw: async () => [{ telegram_user_id: 1, telegram_chat_id: 11 }] };
      await new WeddingVisitNotifier(db as never).notify(visit);
      assert.equal(outbound.length, 1);
      assert.equal(outbound[0].url, "https://api.telegram.org/bottest-token/sendMessage");
      assert.equal(JSON.parse(String(outbound[0].init?.body)).chat_id, 11);

      const broken = { raw: async () => Promise.reject(new Error("db down")) };
      await assert.doesNotReject(new WeddingVisitNotifier(broken as never).notify(visit));
    } finally {
      process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = "";
    }
  });
});

// ── HTTP (controller on a throwaway server, fake DB, real limiter, no token filter) ──

describe("HTTP /wedding", () => {
  let server: Server;
  let base: string;
  let ipCounter = 0;
  const { db, rsvps } = fakeDb({
    rsvps: [rsvpRow({ id: 1, pin: "1234" })],
    guests: [{ id: 5, rsvp_id: 1, name: "Mary Lee", email: "mary@example.com", record_status: "A" }],
  });

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.logContext = {
        requestId: "test",
        startTime: 0,
        method: req.method,
        path: req.path,
        ip: "",
        events: [],
      } as never;
      next();
    });
    app.use("/wedding", createWeddingController(db));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/wedding`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // A fresh X-Real-IP per call keeps weddingRsvpLimiter (10 / 15 min / IP) out of the way.
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Real-IP": `10.0.0.${++ipCounter}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: res.status === 204 ? null : ((await res.json()) as any) };
  };
  const get = async (query: string) => {
    const res = await fetch(`${base}/rsvp/status?${query}`);
    return { status: res.status, json: (await res.json()) as any };
  };

  test("POST /rsvp → 200 { pin, notice } only; bad body → 400 invalid_request_<field>", async () => {
    const ok = await post("/rsvp", validBody);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, "Ok");
    assert.deepEqual(Object.keys(ok.json.data).sort(), ["notice", "pin"]);
    assert.match(ok.json.data.pin, /^\d{4}$/);
    assert.equal(ok.json.data.notice, WEDDING_PDPA_NOTICE);
    assert.equal(rsvps.filter((r) => r.record_status === "A").length, 1); // replaced jon@example.com's RSVP

    const bad = await post("/rsvp", { ...validBody, message: "x".repeat(1001) });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.status, "InvalidRequestException");
    assert.equal(bad.json.data.code, "invalid_request_message");

    const tooMany = await post("/rsvp", { ...validBody, additionalGuestContact: Array(11).fill({ name: "G" }) });
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.json.data.code, "invalid_request_additionalGuestContact");
  });

  test("POST /rsvp/preflight → { exists, hasEmail }", async () => {
    const hit = await post("/rsvp/preflight", { email: "MARY@example.com" });
    assert.equal(hit.status, 200);
    assert.deepEqual(hit.json.data, { exists: true, hasEmail: true });
    assert.deepEqual((await post("/rsvp/preflight", { email: "nobody@example.com" })).json.data, {
      exists: false,
      hasEmail: false,
    });
    assert.equal((await post("/rsvp/preflight", {})).status, 400);
  });

  test("GET /rsvp/status → masked matches; misses are an empty list; bad query → 400", async () => {
    const pin = rsvps.find((r) => r.record_status === "A")!.pin;
    const hit = await get(`name=${encodeURIComponent("Jonathan Tan")}&pin=${pin}`);
    assert.equal(hit.status, 200);
    assert.equal(hit.json.data.matches.length, 1);
    assert.equal(hit.json.data.matches[0].name, "Jonathan ***");
    assert.equal(hit.json.data.matches[0].pin, pin);
    assert.equal("id" in hit.json.data.matches[0], false);

    assert.deepEqual((await get(`name=Nobody&pin=${pin}`)).json.data, { matches: [] });
    assert.equal((await get("name=Jonathan")).status, 400);
    assert.equal((await get("pin=1234")).status, 400);
    assert.equal((await get("name=Jonathan&pin=12a4")).json.data.code, "invalid_request_pin");
  });

  test("POST /visit → 204 with no body, even for junk input; nothing sent without a bot token", async () => {
    const res = await post("/visit", { language: 42, referrer: "x".repeat(1000) });
    assert.equal(res.status, 204);
    assert.equal(outbound.length, 0);
  });
});
