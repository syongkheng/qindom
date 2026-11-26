## Apple Pay

Owns `tb_applepay_transaction` + `tb_applepay_card_label` and `ApplePayService`. Two sources feed one table, so the dashboard shows a single combined feed:

| Source                 | Route (owner)                                                    | Auth          | Service method            |
| ---------------------- | ---------------------------------------------------------------- | ------------- | ------------------------- |
| `v2` bank-SMS Shortcut | `POST /v2/ss/ap/sms` (`siri-shortcut/ApplePay.v2.controller.ts`) | `ss_` API key | `recordSmsTransaction`    |
| `manual`               | `POST /applepay` (this module)                                   | JWT           | `recordManualTransaction` |

V2 stamps `occurred_dt` with the server clock; manual entries supply it. Amounts are never converted; `currency` defaults to SGD.

The V1 NFC-tap Shortcut (`POST /v1/ss/ap/transaction`) was removed in Nov 2026. Existing rows with `source: "v1"` (and rows with no source, which map to `"v1"`) are still listed, so `TransactionSource.V1` stays.

---

### Dashboard `/applepay` (JWT, `mw.auth`, own rows only, `id` = uuid)

| Method | Path                                | Body                                                                                                                                | Response (`data`)                                                   |
| ------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET`  | `/applepay`                         |                                                                                                                                     | `ApplePayTransactionDto[]` (active, newest first, with `cardLabel`) |
| `POST` | `/applepay`                         | `{ amount (0–99,999,999.99), currency? (ISO 4217, default SGD), merchant (≤255), occurredDt (ms, ≤ now + 5 min), category? (≤64) }` | `ApplePayTransactionDto`                                            |
| `POST` | `/applepay/:transactionId/delete`   | `{}`                                                                                                                                | `{ id, deleted: true }`                                             |
| `POST` | `/applepay/:transactionId/restore`  | `{}`                                                                                                                                | `{ id, restored: true }` (undo)                                     |
| `POST` | `/applepay/:transactionId/category` | `{ category: string \| null }` (≤64; blank clears)                                                                                  | `ApplePayTransactionDto`                                            |
| `POST` | `/applepay/card-label/:cardLast4`   | `{ label: string \| null }` (3–4 digit card; ≤64; blank clears)                                                                     | `{ cardLast4, label }`                                              |

`ApplePayTransactionDto` = `{ id, amount, currency, merchant, name, category?, source: "v1"|"v2"|"manual", cardLast4, cardLabel, occurredDt, createdDt }`.

##### Errors

| Status | When                                                                  | `data.code`                   |
| ------ | --------------------------------------------------------------------- | ----------------------------- |
| 400    | invalid body / card digits                                            | `invalid_request_<field>`     |
| 401    | not logged in                                                         | (TokenFilter `token_invalid`) |
| 404    | transaction not found / not yours / wrong state for delete or restore | `entity_not_found`            |

Duplicate detection and CSV export are frontend-only.
