## Siri Shortcut

Ingestion and read routes for the user's own iOS Shortcuts and the Scriptable lock-screen widget. **Auth:** `x-api-key: ss_…` (`mw.ssKey` on the `/v1/ss` and `/v2/ss` mounts, keys managed under `/ss-key`); the user is `getApiKeyUserId(req)`. This folder only holds controllers, the validator and the SMS parser. The services live with their tables: `ApplePayService` (`src/applepay`) and `TodoService` (`src/todo`).

**Frozen contract:** the callers are Shortcuts and a widget script on the user's phone, not fndom. Paths, request fields and response fields can't change without editing those on the phone.

| File                        | Role                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `ApplePay.v2.controller.ts` | `/v2/ss/ap/sms` (bank transaction-alert SMS forwarded verbatim)      |
| `Todo.v1.controller.ts`     | `/v1/ss/todo` (Scriptable widget, `fndom/scriptable/todo-widget.js`) |
| `ApplePaySms.parser.ts`     | pure SMS parsers: `parseAmount`, `parseMerchant`, `parseCardLast4`   |
| `SiriShortcut.validator.ts` | `validateSmsBody`                                                    |
| `SiriShortcut.types.ts`     | `SiriShortcutSmsConfirmationDto`, `ParsedSmsAmount`                  |

---

| Method | Path            | Body                  | Response (`data`)                                                             |
| ------ | --------------- | --------------------- | ----------------------------------------------------------------------------- |
| `POST` | `/v2/ss/ap/sms` | `{ smsBody: string }` | `{ amount, currency, merchant, cardLast4, timestamp }`                        |
| `GET`  | `/v1/ss/todo`   |                       | `TodoWidgetDto` `{ tasks: string[≤3], openCount }` (open tasks, pinned first) |

`occurred_dt` (`timestamp`) is always the server's clock.

The V1 "When Apple Pay is used" (NFC tap) routes, `POST`/`GET /v1/ss/ap/transaction`, were removed in Nov 2026; everyone uses V2. Old rows stored with `source: "v1"` still show on the dashboard. The `/v1/ss` mount stays for the widget.

### V2 parsing

`smsBody` is trimmed, 1–2000 chars. Then:

| Part              | Rule                                                                                                                                                                                 | Missing →                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| currency + amount | first `XXX 1,234.56` / `XXX1.99` (ISO code + 2 decimals), never converted                                                                                                            | 400 `invalid_request_amount`   |
| merchant          | Citi `by … on dd/mm/yy[yy]` (city/country padding after a run of spaces dropped), else `at …` / `to …` up to `on <day> <MON>`, `was completed`, `. If unauthorised` or the end; ≤255 | 400 `invalid_request_merchant` |
| card              | `card ending 1234` (3–4 digits)                                                                                                                                                      | `cardLast4: null`              |

Formats covered by tests: UOB, DBS/POSB, Citibank (local + foreign merchants).

### Errors

| Status | When                                                      | `data.code`                                                                                       |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 400    | bad / missing field, amount out of range, unparseable SMS | `invalid_request_<field>` (`amount`, `merchant`, `smsBody`)                                       |
| 401    | missing / unknown API key                                 | rejected by `RequestApiKeyFilter` before the route; `unauthorized_access` if no user was resolved |
