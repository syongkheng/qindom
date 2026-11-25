## PDCA Enquiry Controller

Contact form for the PDCA website (dental-directory M21). **Public.** **Stores nothing**: it emails the lab and auto-replies to the visitor.

- Mounted at `/pdca` with `[RestRequestLogger, stripPersonalDataFromLog, RequestHeaderFilter]`. `stripPersonalDataFromLog` (`PdcaEnquiry.middleware.ts`) replaces the logged body with field lengths, so personal data never reaches logs or Telegram.
- Origin must be in the `dental-directory` analytics system's `allowed_origins` (and in `ALLOWED_ORIGINS` for CORS), otherwise 403. **The `Origin` header is required** (`isEnquiryOriginAllowed`, stricter than analytics' `isOriginAllowed`), so scripts can't use the form to send mail.
- `pdcaEnquiryLimiter`: 5 per 10 min per IP.

---

#### Send an enquiry

<details>
 <summary><code>POST</code> <code>/pdca/enquiry</code></summary>

##### Body: `PdcaEnquiryBody`

| Field     | Rule                                  |
| --------- | ------------------------------------- |
| `name`    | required, 1–120 (trimmed)             |
| `clinic`  | optional, ≤ 160                       |
| `phone`   | optional, ≤ 20, `^[+()\-\s\d]{8,20}$` |
| `email`   | optional, ≤ 254, email-shaped         |
| `message` | required, 1–4000                      |
| `consent` | must be `true`                        |
| `website` | honeypot, ≤ 200; must be empty        |

At least one of `phone` / `email` is required.

##### Behaviour

1. Honeypot filled → same `200 { message: "Received" }`, nothing sent.
2. Email to the lab (`PDCA_ENQUIRY_TO`, default `admin@pdcadental.com`), Reply-To = visitor (if they gave an email). Failure → 500.
3. Auto-reply to the visitor (only with an email), Reply-To = lab. Failure is ignored.

##### Response: `PdcaEnquiryReceivedDto`

```
{ "code": 200, "status": "Ok", "data": { "message": "Received" } }
```

##### Errors

| Status | When                            | `data.code`                                           |
| ------ | ------------------------------- | ----------------------------------------------------- |
| 400    | invalid field / missing contact | `invalid_request_<field>` / `invalid_request_contact` |
| 403    | Origin missing or not allowed   | `forbidden_access`                                    |
| 429    | over 5 per 10 min               | rate limiter                                          |

</details>

> Nov 2026: validation moved from zod to the hand-written `PdcaEnquiry.validator.ts`.
