## Wedding Controller

- RSVP + page-view ping for the wedding website (`../jessikheng`, `src/utils/rsvpApi.js`). **Auth:** public (`mw.std`); no token filter (no route needs the user; removed Nov 2026 so a logged-in awense user can't get a CSRF 403 from the RSVP form). `POST /rsvp` has its own `weddingRsvpLimiter` (10 / 15 min / IP); everything else only the global limiter.
- **Keyed by email (deliberate).** Re-submitting an email soft-deletes that email's earlier RSVP (+ its guests) and any guest entry for that email on someone else's RSVP, then inserts a new row with a **new 4-digit pin**. No pin is needed to overwrite: every RSVP is emailed, and when a submission replaced an earlier one the submitter's confirmation opens with a red **"Your RSVP was updated"** notice (with when the earlier RSVP was saved, SGT), so an overwritten guest can contact the couple.
- **Pins:** 4 digits from `Math.random`, unique among all rows (deleted ones too, `uq_wedding_rsvp_pin`), up to 20 tries. Lookup is protected only by the global limiter (deliberate). The auto-increment id is never sent.
- **PDPA:** `POST /rsvp` returns the retention notice (`WEDDING_PDPA_NOTICE`, promises deletion the day after the wedding). There is no purge job: the tables are dropped by hand. The public status lookup returns masked names only (`MaskingUtilities.maskName`: last 3 chars → `***`).
- **Emails** (fire-and-forget; a mail failure never fails the RSVP): a confirmation to the submitter (response summary, guests, calendar/directions/website buttons when attending, tamper notice when it replaced one; no pin), and a notice to each guest given an email (skipping the submitter's address and repeats). All user text is HTML-escaped; subjects are single-line. Website links need `WEDDING_WEBSITE_URL` (left out when unset).

---

| Method | Path | Body / query | Response (`data`) |
|---|---|---|---|
| `POST` | `/wedding/rsvp` | `WeddingRsvpBody` (below) | `WeddingRsvpSubmittedDto` `{ pin, notice }` |
| `POST` | `/wedding/rsvp/preflight` | `{ email }` | `WeddingRsvpPreflightDto` `{ exists, hasEmail }` (registrant or guest; `hasEmail` always equals `exists`) |
| `GET` | `/wedding/rsvp/status?name=&pin=` | both required; `pin` = 4 digits | `WeddingRsvpStatusDto` `{ matches: WeddingRsvpStatusMatchDto[] }` (0 or 1) |
| `POST` | `/wedding/visit` | `{ language?, timezone?, screen?, referrer?, path? }` (clipped, never rejected) | **204**, no body. Relays a Telegram alert (device/OS/browser, IP, referrer) to every subscribed chat; nothing stored. |

`WeddingRsvpBody` (strings trimmed; blank optional → `null`; caps = column widths):

| Field | Rule |
|---|---|
| `name` | required, ≤ 255 |
| `email` | required email, ≤ 255 (matched case-insensitively) |
| `attending` | required boolean |
| `contactNumber?` | `^\+?[\d\s\-().]{7,20}$` |
| `dietaryRestrictions?` / `mealPreference?` | ≤ 100 (jessikheng sends meal `regular` \| `vegetarian` \| `halal`; anything else is stored and shown as typed) |
| `message?` | ≤ 1000 |
| `additionalGuestContact?` | array of ≤ 10 `{ name (≤255), email?, contactNumber?, dietaryRestrictions?, mealPreference? }` |

`WeddingRsvpStatusMatchDto` = `{ pin, name (masked), attending, additionalGuestNames (masked), matchedGuestName? (masked; only when found via a guest's name), createdAt, updatedAt }`. The name must be the registrant's or a listed guest's on that pin's RSVP (case- and edge-space-insensitive); anything else is `{ matches: [] }`.

##### Errors
| Status | When | `data.code` |
|---|---|---|
| 400 | bad / missing / oversized field | `invalid_request_<field>` (guests: `invalid_request_additionalGuestContact[i].<field>`) |
| 429 | > 10 RSVPs / 15 min from one IP | (limiter message) |
| 500 | no free pin after 20 tries | `entity_creation_failed` |

jessikheng only checks `response.ok` / `status === "Ok"` and reads `data.pin`, `data.exists`, and the match fields above.

##### Files
- `Wedding.controller.ts` routes · `Wedding.service.ts` `WeddingService` (owns `tb_wedding_rsvp`, `tb_wedding_rsvp_guest`) + pure helpers (`randomPin`, `replacedRsvp`, `toStatusMatchDto`, `guestMailRecipients`) · `Wedding.validator.ts` · `Wedding.types.ts`
- `Wedding.emailTemplate.ts` HTML shell + `rsvpConfirmationMail` / `rsvpGuestMail` (pure, return `MailOptions`) · `Wedding.eventLinks.ts` calendar / directions / website URLs
- `Wedding.visitNotifier.ts` Telegram page-view alert (`AWENSE_CDN_TELEGRAM_BOT_TOKEN`; never throws)
- `Wedding.test.ts` validators, replace/tamper logic, pin retry, masking, escaping, in-process HTTP
