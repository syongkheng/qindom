import { test } from "node:test";
import assert from "node:assert/strict";
import { autoReplyMail, EnquirySchema, isSpam, loggablePayload, notificationMail } from "./PdcaEnquiry.js";

const valid = {
  name: "Dr Tan",
  clinic: "Smile Clinic",
  phone: "",
  email: "tan@example.com",
  message: "Hello\nthere",
  consent: true,
  website: "",
};

test("accepts a valid enquiry", () => {
  assert.equal(EnquirySchema.safeParse(valid).success, true);
  assert.equal(EnquirySchema.safeParse({ ...valid, email: "", phone: "+65 6842 3371" }).success, true);
});

test("requires consent, name, message and a phone or email", () => {
  assert.equal(EnquirySchema.safeParse({ ...valid, consent: false }).success, false);
  assert.equal(EnquirySchema.safeParse({ ...valid, name: " " }).success, false);
  assert.equal(EnquirySchema.safeParse({ ...valid, message: "" }).success, false);
  assert.equal(EnquirySchema.safeParse({ ...valid, email: "", phone: "" }).success, false);
  assert.equal(EnquirySchema.safeParse({ ...valid, email: "nope" }).success, false);
  assert.equal(EnquirySchema.safeParse({ ...valid, email: "", phone: "12" }).success, false);
});

test("honeypot marks spam", () => {
  const e = EnquirySchema.parse({ ...valid, website: "http://spam" });
  assert.equal(isSpam(e), true);
  assert.equal(isSpam(EnquirySchema.parse(valid)), false);
});

test("notification escapes HTML and replies to the visitor", () => {
  const e = EnquirySchema.parse({ ...valid, name: "<b>Dr</b>", message: "<script>x</script>" });
  const m = notificationMail(e, "admin@pdcadental.com");
  assert.equal(m.to, "admin@pdcadental.com");
  assert.equal(m.replyTo, "tan@example.com");
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("&lt;script&gt;"));
});

test("auto-reply only when an email was given, replying to the lab", () => {
  const reply = autoReplyMail(EnquirySchema.parse(valid), "admin@pdcadental.com");
  assert.equal(reply?.to, "tan@example.com");
  assert.equal(reply?.replyTo, "admin@pdcadental.com");
  assert.match(reply!.text, /same working day/);
  assert.equal(autoReplyMail(EnquirySchema.parse({ ...valid, email: "", phone: "+65 6842 3371" }), "a@b.c"), null);
});

test("log payload holds no personal data", () => {
  const p = loggablePayload(valid);
  assert.deepEqual(p, {
    name: "[6 chars]",
    clinic: "[12 chars]",
    phone: "[0 chars]",
    email: "[15 chars]",
    message: "[11 chars]",
    consent: true,
    website: "[0 chars]",
  });
});
