import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  autoReplyMail,
  isEnquiryOriginAllowed,
  isSpam,
  notificationMail,
  PdcaEnquiryService,
} from "./PdcaEnquiry.service.js";
import type { RegisteredSystem } from "../analytics/Analytics.types.js";
import { validateEnquiryBody } from "./PdcaEnquiry.validator.js";
import { loggablePayload } from "./PdcaEnquiry.middleware.js";
import { MailerUtilities, MailOptions } from "../utils/MailerUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const valid = {
  name: "Dr Tan",
  clinic: "Smile Clinic",
  phone: "",
  email: "tan@example.com",
  message: "Hello\nthere",
  consent: true,
  website: "",
};

const realSendMail = MailerUtilities.sendMail;
afterEach(() => {
  MailerUtilities.sendMail = realSendMail;
});

const rejectsField = (body: Record<string, unknown>, field: string) =>
  assert.throws(
    () => validateEnquiryBody(body),
    (err: InstanceType<typeof Exceptions.InvalidRequest>) => err.fieldName === field,
    field,
  );

test("accepts a valid enquiry; optional fields default to empty strings", () => {
  assert.deepEqual(validateEnquiryBody(valid), valid);
  const phoneOnly = validateEnquiryBody({ name: " Dr Tan ", message: "Hi", consent: true, phone: "+65 6842 3371" });
  assert.deepEqual(phoneOnly, {
    name: "Dr Tan",
    clinic: "",
    phone: "+65 6842 3371",
    email: "",
    message: "Hi",
    consent: true,
    website: "",
  });
});

test("requires consent, name, message and a valid phone or email", () => {
  rejectsField({ ...valid, consent: false }, "consent");
  rejectsField({ ...valid, consent: "true" }, "consent");
  rejectsField({ ...valid, name: " " }, "name");
  rejectsField({ ...valid, message: "" }, "message");
  rejectsField({ ...valid, email: "", phone: "" }, "contact");
  rejectsField({ ...valid, email: "nope" }, "email");
  rejectsField({ ...valid, email: "", phone: "12" }, "phone");
  rejectsField({ ...valid, message: "x".repeat(4001) }, "message");
});

test("honeypot marks spam", () => {
  assert.equal(isSpam(validateEnquiryBody({ ...valid, website: "http://spam" })), true);
  assert.equal(isSpam(validateEnquiryBody({ ...valid, website: "   " })), false);
  assert.equal(isSpam(validateEnquiryBody(valid)), false);
});

test("notification escapes HTML and replies to the visitor", () => {
  const e = validateEnquiryBody({ ...valid, name: "<b>Dr</b>", message: "<script>x</script>" });
  const m = notificationMail(e, "admin@pdcadental.com");
  assert.equal(m.to, "admin@pdcadental.com");
  assert.equal(m.replyTo, "tan@example.com");
  assert.ok(!m.html!.includes("<script>"));
  assert.ok(m.html!.includes("&lt;script&gt;"));
});

test("auto-reply only when an email was given, replying to the lab", () => {
  const reply = autoReplyMail(validateEnquiryBody(valid), "admin@pdcadental.com");
  assert.equal(reply?.to, "tan@example.com");
  assert.equal(reply?.replyTo, "admin@pdcadental.com");
  assert.match(reply!.text!, /same working day/);
  assert.match(reply!.text!, /\+65 6842 3371/);
  assert.equal(autoReplyMail(validateEnquiryBody({ ...valid, email: "", phone: "+65 6842 3371" }), "a@b.c"), null);
});

test("submit emails the lab then the visitor; an auto-reply failure is swallowed; spam sends nothing", async () => {
  const sent: MailOptions[] = [];
  MailerUtilities.sendMail = async (m: MailOptions) => {
    sent.push(m);
    if (m.to === "tan@example.com") throw new Error("smtp down");
  };
  const svc = new PdcaEnquiryService();
  await svc.submit(validateEnquiryBody(valid));
  assert.deepEqual(
    sent.map((m) => m.to),
    ["admin@pdcadental.com", "tan@example.com"],
  );

  sent.length = 0;
  await svc.submit(validateEnquiryBody({ ...valid, website: "bot" }));
  assert.equal(sent.length, 0);
});

test("a failed lab email is an error", async () => {
  MailerUtilities.sendMail = async () => {
    throw new Error("smtp down");
  };
  await assert.rejects(new PdcaEnquiryService().submit(validateEnquiryBody(valid)));
});

test("origin is required and must be on the system's list", () => {
  const system = { allowedOrigins: ["https://pdcadental.com"] } as unknown as RegisteredSystem;
  assert.equal(isEnquiryOriginAllowed(system, "https://pdcadental.com"), true);
  assert.equal(isEnquiryOriginAllowed(system, undefined), false);
  assert.equal(isEnquiryOriginAllowed(system, "https://evil.example"), false);
  assert.equal(isEnquiryOriginAllowed(null, "https://pdcadental.com"), false);
});

test("log payload holds no personal data", () => {
  assert.deepEqual(loggablePayload(valid), {
    name: "[6 chars]",
    clinic: "[12 chars]",
    phone: "[0 chars]",
    email: "[15 chars]",
    message: "[11 chars]",
    consent: true,
    website: "[0 chars]",
  });
});
