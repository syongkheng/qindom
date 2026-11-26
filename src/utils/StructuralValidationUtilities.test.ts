import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { StructuralValidationUtilities as V, charLength } from "./StructuralValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof Exceptions.InvalidRequest);
    return err.code;
  }
  assert.fail("expected InvalidRequest");
};

describe("V.requiredText", () => {
  test("trims and returns the value; blank, non-string and missing are 400s", () => {
    assert.equal(V.requiredText("  hi  ", "title", 5), "hi");
    assert.equal(
      code(() => V.requiredText("   ", "title", 5)),
      "invalid_request_title",
    );
    assert.equal(
      code(() => V.requiredText(5, "title", 5)),
      "invalid_request_title",
    );
    assert.equal(
      code(() => V.requiredText(undefined, "title", 5)),
      "invalid_request_title",
    );
    assert.equal(
      code(() => V.requiredText(null, "title", 5)),
      "invalid_request_title",
    );
  });

  test("the cap counts characters (code points) like utf8mb4 VARCHAR, not UTF-16 units", () => {
    const fiveEmoji = "😀😀😀😀😀"; // String.length 10
    assert.equal(fiveEmoji.length, 10);
    assert.equal(V.requiredText(fiveEmoji, "title", 5), fiveEmoji);
    assert.equal(
      code(() => V.requiredText(fiveEmoji + "a", "title", 5)),
      "invalid_request_title",
    );
    assert.equal(V.requiredText("abcde", "title", 5), "abcde");
    assert.equal(
      code(() => V.requiredText("abcdef", "title", 5)),
      "invalid_request_title",
    );
  });

  test("the cap applies after trimming", () => {
    assert.equal(V.requiredText("  abcde  ", "title", 5), "abcde");
  });

  test("records the failed check on the event", () => {
    const event: IRequestLogEvent = { type: "VALIDATION", message: "body", children: [], timestamp: 0 };
    code(() => V.requiredText("abcdef", "title", 5, event));
    assert.ok(event.children.some((c) => c.includes("'title' 1–5 chars")));
  });
});

describe("V.optionalText", () => {
  test("undefined / null / empty / blank → null; otherwise trimmed", () => {
    assert.equal(V.optionalText(undefined, "notes", 5), null);
    assert.equal(V.optionalText(null, "notes", 5), null);
    assert.equal(V.optionalText("", "notes", 5), null);
    assert.equal(V.optionalText("   ", "notes", 5), null);
    assert.equal(V.optionalText(" ok ", "notes", 5), "ok");
  });

  test("non-strings and over-long values are 400s; emoji count as one character", () => {
    assert.equal(
      code(() => V.optionalText(1, "notes", 5)),
      "invalid_request_notes",
    );
    assert.equal(
      code(() => V.optionalText("abcdef", "notes", 5)),
      "invalid_request_notes",
    );
    assert.equal(V.optionalText("👍🏽👍", "notes", 3), "👍🏽👍"); // 3 code points (skin tone is its own)
    assert.equal(
      code(() => V.optionalText("👍🏽👍👍", "notes", 3)),
      "invalid_request_notes",
    );
  });
});

describe("charLength / primitives", () => {
  test("charLength counts code points", () => {
    assert.equal(charLength(""), 0);
    assert.equal(charLength("abc"), 3);
    assert.equal(charLength("中文"), 2);
    assert.equal(charLength("😀a"), 2);
  });

  test("required / string / number / oneOf / email keep their field-name codes", () => {
    assert.equal(
      code(() => V.required(undefined, "x")),
      "invalid_request_x",
    );
    assert.equal(
      code(() => V.string(1, "x")),
      "invalid_request_x",
    );
    assert.equal(
      code(() => V.number(Number.NaN, "x")),
      "invalid_request_x",
    );
    assert.equal(
      code(() => V.oneOf("c", ["a", "b"], "x")),
      "invalid_request_x",
    );
    assert.equal(
      code(() => V.email("nope", "x")),
      "invalid_request_x",
    );
    assert.doesNotThrow(() => V.email("a@b.co", "x"));
    assert.doesNotThrow(() => V.requiredOneOfWhen(false, undefined, ["a"], "x"));
  });
});
