import { test, after, mock } from "node:test";
import axios from "axios";
import sharp from "sharp";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import express, { RequestHandler } from "express";
import { buildUploadCaption, TgImageService, toTgAdminDto, toTgImageSummaryDto } from "./TgImage.service.js";
import { createTgImageController, createTgImageGetController } from "./TgImage.controller.js";
import {
  FILE_NAME_MAX_LENGTH,
  UUID_MAX_LENGTH,
  validateAdminBody,
  validateUploadBody,
  validateUploadFile,
} from "./TgImage.validator.js";
import { escapeTelegramHtml } from "../utils/TelegramUtilities.js";
import { BaseException } from "../exceptions/AppExceptions.js";
import { Roles } from "../auth/Permission.js";

type Row = Record<string, any>;

/** In-memory stand-in for the KnexSqlUtilities calls TgImageService makes (no raw SQL). */
function fakeDb(rows: Row[] = []) {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const db = {
    async find(
      _t: string,
      where: Row,
      opts: { limit?: number; orderBy?: string; orderDirection?: string; extraWhere?: (qb: unknown) => void } = {},
    ) {
      const notNull: string[] = [];
      opts.extraWhere?.({ whereNotNull: (col: string) => notNull.push(col) });
      let found = rows.filter((r) => matches(r, where) && notNull.every((c) => r[c] != null));
      if (opts.orderBy) {
        const key = opts.orderBy;
        found = [...found].sort((a, b) => a[key] - b[key]);
        if (opts.orderDirection === "desc") found.reverse();
      }
      return opts.limit ? found.slice(0, opts.limit) : found;
    },
    async findOne(_t: string, where: Row) {
      return rows.find((r) => matches(r, where));
    },
    async insert(_t: string, data: Row) {
      rows.push({ id: rows.length + 1, ...data });
      return data;
    },
    async update(_t: string, where: Row, data: Row) {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return hit;
    },
  };
  return { db: db as never, rows };
}

const admin = (telegramUserId: number, extra: Row = {}): Row => ({
  id: telegramUserId,
  telegram_user_id: telegramUserId,
  telegram_chat_id: null,
  added_dt: telegramUserId,
  record_status: "A",
  ...extra,
});

const codeOf = (expected: string) => (err: unknown) => {
  assert.ok(err instanceof BaseException);
  assert.equal(err.code, expected);
  return true;
};

const multerFile = (extra: Partial<Express.Multer.File> = {}) =>
  ({ buffer: Buffer.from("x"), originalname: "photo.jpg", mimetype: "image/jpeg", ...extra }) as Express.Multer.File;

// ── Mappers ──

test("toTgAdminDto / toTgImageSummaryDto map columns to camelCase", () => {
  assert.deepEqual(toTgAdminDto({ id: 1, telegram_user_id: 42, added_dt: 99 }), {
    id: 1,
    telegramUserId: 42,
    addedAt: 99,
  });
  assert.deepEqual(toTgImageSummaryDto({ short_code: "1a2b3c4d", created_dt: 5 } as never), {
    shortCode: "1a2b3c4d",
    fileName: null,
    mimeType: null,
    sizeInBytes: null,
    createdAt: 5,
  });
});

test("buildUploadCaption lists only the known details", () => {
  assert.equal(
    buildUploadCaption({ username: "kheng", ip: "1.2.3.4" }, null),
    "📤 agenda_upload\n👤 kheng\n🌐 1.2.3.4",
  );
  assert.equal(buildUploadCaption({ username: "", ip: "" }, "s1"), "📤 agenda_upload\n📋 s1");
});

// ── Validators ──

test("validateUploadFile: missing file is invalid_request_file", () => {
  assert.throws(() => validateUploadFile(undefined), codeOf("invalid_request_file"));
});

test("validateUploadFile: file name and mime type are capped at their column widths", () => {
  assert.equal(validateUploadFile(multerFile()).originalName, "photo.jpg");
  assert.throws(
    () => validateUploadFile(multerFile({ originalname: "a".repeat(FILE_NAME_MAX_LENGTH + 1) })),
    codeOf("invalid_request_fileName"),
  );
  assert.throws(
    () => validateUploadFile(multerFile({ mimetype: "x".repeat(129) })),
    codeOf("invalid_request_mimeType"),
  );
});

test("validateUploadFile: only image/* uploads are accepted (SVG still allowed, rasterised later)", () => {
  assert.equal(validateUploadFile(multerFile({ mimetype: "image/svg+xml" })).mimeType, "image/svg+xml");
  assert.equal(validateUploadFile(multerFile({ mimetype: "IMAGE/PNG" })).mimeType, "IMAGE/PNG");
  for (const mimetype of ["application/pdf", "text/html", "application/octet-stream"]) {
    assert.throws(() => validateUploadFile(multerFile({ mimetype })), codeOf("invalid_request_file"));
  }
});

test("escapeTelegramHtml neutralises tags in user-supplied file names", () => {
  assert.equal(escapeTelegramHtml('<a href="x">a&b</a>'), '&lt;a href="x"&gt;a&amp;b&lt;/a&gt;');
});

test("validateUploadBody: optional fields, blank → null, uuid capped", () => {
  assert.deepEqual(validateUploadBody(undefined), { sessionId: null, uuid: null });
  assert.deepEqual(validateUploadBody({ sessionId: " s1 ", uuid: "" }), { sessionId: "s1", uuid: null });
  assert.throws(() => validateUploadBody({ uuid: "u".repeat(UUID_MAX_LENGTH + 1) }), codeOf("invalid_request_uuid"));
});

test("validateAdminBody: positive integer as number or numeric string", () => {
  assert.deepEqual(validateAdminBody({ telegramUserId: 123 }), { telegramUserId: 123 });
  assert.deepEqual(validateAdminBody({ telegramUserId: "456" }), { telegramUserId: 456 });
  assert.throws(() => validateAdminBody({}), codeOf("invalid_request_telegramUserId"));
  for (const bad of [0, -1, 1.5, "abc", "", true]) {
    assert.throws(() => validateAdminBody({ telegramUserId: bad }), codeOf("invalid_request_telegramUserId"));
  }
});

// ── Service ──

test("listAdmins returns active admins newest first, never removed ones", async () => {
  const { db } = fakeDb([admin(1), admin(3), admin(2, { record_status: "I" })]);
  const admins = await new TgImageService(db).listAdmins();
  assert.deepEqual(
    admins.map((a) => a.telegramUserId),
    [3, 1],
  );
});

test("addToWhitelist inserts, is idempotent, and reactivates a removed admin", async () => {
  const { db, rows } = fakeDb([admin(2, { record_status: "I", telegram_chat_id: 77 })]);
  const svc = new TgImageService(db);
  await svc.addToWhitelist(1);
  await svc.addToWhitelist(1);
  assert.equal(rows.filter((r) => r.telegram_user_id === 1).length, 1);
  await svc.addToWhitelist(2);
  assert.equal(rows.find((r) => r.telegram_user_id === 2)?.record_status, "A");
  assert.equal(rows.find((r) => r.telegram_user_id === 2)?.telegram_chat_id, 77);
});

test("removeFromWhitelist marks the row 'I' and reports whether anything changed", async () => {
  const { db, rows } = fakeDb([admin(1)]);
  const svc = new TgImageService(db);
  assert.equal(await svc.removeFromWhitelist(1), true);
  assert.equal(rows[0].record_status, "I");
  assert.equal(await svc.removeFromWhitelist(1), false);
  assert.equal(await svc.isWhitelisted(1), false);
});

test("storeAdminChatId only updates an active admin", async () => {
  const { db, rows } = fakeDb([admin(1), admin(2, { record_status: "I" })]);
  const svc = new TgImageService(db);
  await svc.storeAdminChatId(1, 500);
  await svc.storeAdminChatId(2, 600);
  assert.equal(rows[0].telegram_chat_id, 500);
  assert.equal(rows[1].telegram_chat_id, null);
});

test("listRecent maps rows, newest id first, capped at limit", async () => {
  const image = (id: number) => ({ id, short_code: `c${id}`, created_dt: id, record_status: "A", file_name: "f" });
  const { db } = fakeDb([image(1), image(2), image(3), { ...image(4), record_status: "D" }]);
  const items = await new TgImageService(db).listRecent(2);
  assert.deepEqual(
    items.map((i) => i.shortCode),
    ["c3", "c2"],
  );
});

test("loadImage: unknown or deleted short code is a 404 before Telegram is called", async () => {
  const { db } = fakeDb([{ short_code: "deadbeef", telegram_file_id: "f", record_status: "D" }]);
  await assert.rejects(new TgImageService(db).loadImage("deadbeef"), codeOf("entity_not_found"));
});

test("upload: no admin chat yet (nobody sent /start) is a 500 before Telegram is called", async () => {
  const previous = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
  process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = "test-token";
  try {
    const { db } = fakeDb([admin(1)]); // whitelisted but no telegram_chat_id
    const svc = new TgImageService(db);
    const file = validateUploadFile(multerFile());
    await assert.rejects(
      svc.upload(file, { sessionId: null, uuid: null }, { username: "u", ip: "ip" }),
      codeOf("unknown"),
    );
  } finally {
    if (previous === undefined) delete process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
    else process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = previous;
  }
});

// ── HTTP (controllers on a throwaway server; nothing reaches Telegram) ──

async function startApp(roles: string[], rows: Row[] = []) {
  const { db } = fakeDb(rows);
  const app = express();
  app.use(express.json());
  // What RestRequestLogger (every mount) and MandatoryTokenFilter (JWT mount) would set.
  const fakeLogContext: RequestHandler = (req, _res, next) => {
    req.logContext = { requestId: "test", startTime: 0, method: req.method, path: req.path, ip: "", events: [] };
    next();
  };
  const fakeAuth: RequestHandler = (req, _res, next) => {
    (req as unknown as { user: unknown }).user = { username: "u", roles };
    next();
  };
  app.use(fakeLogContext);
  app.use("/img", createTgImageGetController(db));
  app.use("/img", fakeAuth, createTgImageController(db));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/img`;
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("HTTP: GET unknown short code → 404 entity_not_found", async () => {
  const base = await startApp([]);
  const res = await fetch(`${base}/deadbeef`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).data.code, "entity_not_found");
});

test("HTTP: admin routes without SYSTEM_R5 → 403 forbidden_access", async () => {
  const base = await startApp([]);
  for (const res of [
    await fetch(`${base}/admin/list`),
    await post(`${base}/admin/add`, { telegramUserId: 1 }),
    await post(`${base}/admin/remove`, { telegramUserId: 1 }),
  ]) {
    assert.equal(res.status, 403);
    assert.equal((await res.json()).data.code, "forbidden_access");
  }
});

test("HTTP: owner add without telegramUserId → 400; list → camelCase array", async () => {
  const base = await startApp([Roles.OWNER]);
  const bad = await post(`${base}/admin/add`, {});
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).data.code, "invalid_request_telegramUserId");
  const list = await fetch(`${base}/admin/list`);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).data, []);
});

test("HTTP: upload without a file → 400 invalid_request_file", async () => {
  const base = await startApp([]);
  const res = await post(`${base}/upload`, {});
  assert.equal(res.status, 400);
  assert.equal((await res.json()).data.code, "invalid_request_file");
});

test("HTTP: GET streams a re-encoded image with the security headers (Telegram stubbed)", async () => {
  const previous = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
  process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = "test-token";
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const urls: string[] = [];
  const get = mock.method(axios, "get", async (url: string) => {
    urls.push(url);
    return url.includes("/getFile?")
      ? { data: { ok: true, result: { file_path: "documents/file_1.png" } } }
      : { data: png };
  });
  try {
    const base = await startApp(
      [],
      [
        { short_code: "aaaa1111", telegram_file_id: "F1", mime_type: "image/png", record_status: "A" },
        { short_code: "bbbb2222", telegram_file_id: "F2", mime_type: "image/svg+xml", record_status: "A" },
      ],
    );
    const res = await fetch(`${base}/aaaa1111`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
    assert.equal(res.headers.get("cache-control"), "public, max-age=86400");
    assert.equal(res.headers.get("content-security-policy"), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    const body = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...body.subarray(0, 3)], [0xff, 0xd8, 0xff]); // JPEG magic, not the stored PNG
    assert.deepEqual(urls.slice(0, 2), [
      "https://api.telegram.org/bottest-token/getFile?file_id=F1",
      "https://api.telegram.org/file/bottest-token/documents/file_1.png",
    ]);

    const svg = await fetch(`${base}/bbbb2222`); // legacy SVG rows are rasterised, never served raw
    assert.equal(svg.headers.get("content-type"), "image/png");
    await svg.arrayBuffer();
  } finally {
    get.mock.restore();
    if (previous === undefined) delete process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
    else process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = previous;
  }
});

test("HTTP: GET when Telegram refuses the download → 502 external_request_exception", async () => {
  const previous = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
  process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = "test-token";
  const get = mock.method(axios, "get", async () => {
    throw new Error("Request failed with status code 400");
  });
  try {
    const base = await startApp([], [{ short_code: "cccc3333", telegram_file_id: "F3", record_status: "A" }]);
    const res = await fetch(`${base}/cccc3333`);
    assert.equal(res.status, 502);
    assert.equal((await res.json()).data.code, "external_request_exception");
  } finally {
    get.mock.restore();
    if (previous === undefined) delete process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
    else process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = previous;
  }
});

test("HTTP: a stored file sharp can't decode → 500 JSON error, process keeps running", async () => {
  const previous = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
  process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = "test-token";
  const get = mock.method(axios, "get", async (url: string) =>
    url.includes("/getFile?")
      ? { data: { ok: true, result: { file_path: "documents/file_9.pdf" } } }
      : { data: Buffer.from("%PDF-1.4 not an image") },
  );
  try {
    const base = await startApp(
      [],
      [
        { short_code: "dddd4444", telegram_file_id: "F4", mime_type: "application/pdf", record_status: "A" },
        { short_code: "eeee5555", telegram_file_id: "F5", mime_type: "image/svg+xml", record_status: "A" },
      ],
    );
    for (const code of ["dddd4444", "eeee5555"]) {
      const res = await fetch(`${base}/${code}`);
      assert.equal(res.status, 500);
      assert.equal(res.headers.get("content-security-policy"), null); // failed before any image header
      assert.equal((await res.json()).data.code, "unknown");
    }
    assert.equal((await fetch(`${base}/ffff0000`)).status, 404); // server still serving
  } finally {
    get.mock.restore();
    if (previous === undefined) delete process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
    else process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN = previous;
  }
});

test("HTTP: non-image upload → 400 invalid_request_file before Telegram", async () => {
  const base = await startApp([]);
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.4"], { type: "application/pdf" }), "doc.pdf");
  const res = await fetch(`${base}/upload`, { method: "POST", body: form });
  assert.equal(res.status, 400);
  const data = (await res.json()).data;
  assert.equal(data.code, "invalid_request_file");
  assert.equal(data.typeOfError, "format");
});
