import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { maskName } from "./MaskingUtilities.js";
import { formatCoord } from "./CoordinateUtilities.js";
import { sha256Hex } from "./HashUtilities.js";
import { toMessage } from "./ErrorUtilities.js";
import { MailerUtilities, formatFromHeader } from "./MailerUtilities.js";
import { CSRF_COOKIE, JWT_COOKIE, clearAuthCookies, setAuthCookies } from "./AuthCookieUtilities.js";
import { JWT_TTL_MS } from "../token/Token.service.js";
import { IS_PRD } from "../config/env.js";
import {
  TELEGRAM_BOT_TOKEN_ENV,
  escapeTelegramHtml,
  escapeTelegramHtmlAttribute,
  getTelegramBotToken,
  sendTelegramHtml,
} from "./TelegramUtilities.js";

describe("maskName", () => {
  test("masks the last 3 / 2 / 1 characters by length; trims; short names unchanged", () => {
    assert.equal(maskName("Jonathan"), "Jonat***");
    assert.equal(maskName("Lina"), "L***");
    assert.equal(maskName("Tan"), "T**");
    assert.equal(maskName("YK"), "Y*");
    assert.equal(maskName("Y"), "Y");
    assert.equal(maskName("  Tan  "), "T**");
    assert.equal(maskName(""), "");
    assert.equal(maskName(null), "");
    assert.equal(maskName(undefined), "");
  });

  test("counts characters, so astral names never get a half emoji", () => {
    assert.equal(maskName("Al😀😀"), "A***");
    assert.equal(maskName("陈小明"), "陈**");
  });
});

describe("formatCoord", () => {
  test("8 decimals max, trailing zeros dropped, capped at maxChars, null for non-numbers", () => {
    assert.equal(formatCoord(1.437556123456), "1.43755612");
    assert.equal(formatCoord("103.8000"), "103.8");
    assert.equal(formatCoord(2), "2");
    assert.equal(formatCoord(-1.5), "-1.5");
    assert.equal(formatCoord(103.12345678, 6), "103.12");
    assert.equal(formatCoord("abc"), null);
    assert.equal(formatCoord(Number.POSITIVE_INFINITY), null);
  });
});

describe("sha256Hex / toMessage", () => {
  test("sha256Hex is lowercase hex of the UTF-8 bytes", () => {
    assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("toMessage reads Error.message, else String()", () => {
    assert.equal(toMessage(new Error("x")), "x");
    assert.equal(toMessage("plain"), "plain");
    assert.equal(toMessage(42), "42");
  });
});

describe("MailerUtilities", () => {
  test("From header strips quotes and line breaks from the display name; default no-reply", () => {
    assert.equal(formatFromHeader(undefined, "a@b.co"), '"no-reply" <a@b.co>');
    assert.equal(formatFromHeader('Lab "X"\r\nBcc: evil', "a@b.co"), '"Lab XBcc: evil" <a@b.co>');
  });

  test("escapeHtml escapes the five HTML-significant characters", () => {
    assert.equal(
      MailerUtilities.escapeHtml(`<a href="x">'&'</a>`),
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("AuthCookieUtilities", () => {
  type CookieCall = { op: "set" | "clear"; name: string; value?: string; options: Record<string, unknown> };
  const fakeRes = (calls: CookieCall[]) =>
    ({
      cookie(name: string, value: string, options: Record<string, unknown>) {
        calls.push({ op: "set", name, value, options });
      },
      clearCookie(name: string, options: Record<string, unknown>) {
        calls.push({ op: "clear", name, options });
      },
    }) as unknown as Response;

  test("setAuthCookies: httpOnly JWT + readable 64-hex CSRF, lax, JWT lifetime", () => {
    const calls: CookieCall[] = [];
    setAuthCookies(fakeRes(calls), "tok");
    const [jwt, csrf] = calls;
    assert.equal(jwt.name, JWT_COOKIE);
    assert.equal(jwt.value, "tok");
    assert.equal(jwt.options.httpOnly, true);
    assert.equal(csrf.name, CSRF_COOKIE);
    assert.match(csrf.value!, /^[0-9a-f]{64}$/);
    assert.equal(csrf.options.httpOnly, false);
    for (const c of calls) {
      assert.equal(c.options.sameSite, "lax");
      assert.equal(c.options.path, "/");
      assert.equal(c.options.maxAge, JWT_TTL_MS);
      assert.equal(c.options.secure, IS_PRD);
      assert.equal(c.options.domain, IS_PRD ? ".awense.com" : undefined);
    }
  });

  test("clearAuthCookies clears both (plus the legacy host-only pair in prd)", () => {
    const calls: CookieCall[] = [];
    clearAuthCookies(fakeRes(calls));
    assert.deepEqual(
      calls.map((c) => c.name),
      IS_PRD ? [JWT_COOKIE, CSRF_COOKIE, JWT_COOKIE, CSRF_COOKIE] : [JWT_COOKIE, CSRF_COOKIE],
    );
    assert.ok(calls.every((c) => c.op === "clear"));
  });
});

describe("TelegramUtilities", () => {
  const withToken = async (token: string | undefined, fn: () => Promise<void>) => {
    const previous = process.env[TELEGRAM_BOT_TOKEN_ENV];
    if (token === undefined) delete process.env[TELEGRAM_BOT_TOKEN_ENV];
    else process.env[TELEGRAM_BOT_TOKEN_ENV] = token;
    try {
      await fn();
    } finally {
      if (previous === undefined) delete process.env[TELEGRAM_BOT_TOKEN_ENV];
      else process.env[TELEGRAM_BOT_TOKEN_ENV] = previous;
    }
  };
  const stubFetch = (status: number, sent: { url: string; body: Record<string, unknown> }[]) => {
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return new Response("{}", { status });
    }) as typeof fetch;
    return () => {
      globalThis.fetch = real;
    };
  };

  test("escaping: text escapes & < >, attributes also escape quotes", () => {
    assert.equal(escapeTelegramHtml('<b a="1">&</b>'), '&lt;b a="1"&gt;&amp;&lt;/b&gt;');
    assert.equal(escapeTelegramHtmlAttribute('a"b&c'), "a&quot;b&amp;c");
  });

  test("the token is read lazily and blank counts as unset", async () => {
    await withToken("", async () => assert.equal(getTelegramBotToken(), undefined));
    await withToken("t1", async () => assert.equal(getTelegramBotToken(), "t1"));
  });

  test("sendTelegramHtml posts an HTML sendMessage with previews off", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const restore = stubFetch(200, sent);
    try {
      await withToken("t1", () => sendTelegramHtml(42, "<b>hi</b>"));
    } finally {
      restore();
    }
    assert.equal(sent[0].url, "https://api.telegram.org/bott1/sendMessage");
    assert.deepEqual(sent[0].body, {
      chat_id: 42,
      parse_mode: "HTML",
      text: "<b>hi</b>",
      link_preview_options: { is_disabled: true },
    });
  });

  test("sendTelegramHtml throws on a non-OK answer and when the token is missing", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const restore = stubFetch(400, sent);
    try {
      await withToken("t1", () => assert.rejects(sendTelegramHtml(1, "x"), /answered 400/));
      await withToken(undefined, () => assert.rejects(sendTelegramHtml(1, "x"), /is not set/));
    } finally {
      restore();
    }
    assert.equal(sent.length, 1);
  });
});
