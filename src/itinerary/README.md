## Itinerary

Travel planner trips: agenda items (with image files), bookings, packing list, notes. Mounted with `mw.std`; the owner routes add `MandatoryTokenFilter` per route, the two share routes are public.

- A trip is addressed by its `sessionId` (uuid, owner routes) or its `shortCode` (8 hex chars, share link `/travel/v/:shortCode`).
- **Access:** only the creator (`created_by_id`) can read it by `sessionId`, update or delete it (someone else's trip → 403, missing/deleted → 404). Anyone with the share link can view it, unless it has an access code (`challenge`, 6 chars): then `GET /v/:shortCode` only answers `{ hasChallenge: true }` and the trip is unlocked with `POST /challenge`.
- **`POST /challenge` limiter** (`itineraryChallengeLimiter`): 10 failed attempts (any 4xx: wrong code 400, unknown trip 404, bad body 400) per 15 min per IP; successful unlocks don't count. The 11th attempt is a 429 even with the right code.
- **Views:** each public display (`GET /v/:shortCode` of an open trip, successful `POST /challenge`) inserts a row in `tb_travel_itinerary_view` (fire-and-forget, never fails the request); public responses carry `viewCount`.
- **Files:** agenda files are images uploaded first through `POST /img/upload` (tgimage), then attached by the trip save via `_filesToInsert`. Responses carry metadata only; the bytes are served by `GET /img/:shortCode`. Files are removed with `POST /file/delete` (file module).
- **Image ownership:** before the transaction, every `_filesToInsert[].tgShortCode` is checked against `tb_tg_image` (`TgImageService.assertAttachableBy`): an unknown or deleted short code is a 400 `invalid_request_tgShortCode`, an image uploaded by another user (`created_by_id` set and different) is a 403, on create and update; nothing is written. Images uploaded before migration `20261126000200` have `created_by_id` NULL (uploader unknown) and stay attachable by anyone.
- **Child rows are addressed by client ids** on update. Before anything is written, every child id (agenda item, booking, packing item, note; in the lists to save **and** in the `_…IdsToDelete` lists) must belong to this trip (soft-deleted own rows count), otherwise the whole save is a 403 and nothing changes. Inside the transaction every child update/delete is still scoped by `itinerary_id`. A file `uuid` that is already attached (to any item) is skipped.
- The save runs in one transaction (all or nothing).

---

| Method | Path                           | Auth   | Body                       | Response (`data`)                                 |
| ------ | ------------------------------ | ------ | -------------------------- | ------------------------------------------------- |
| `GET`  | `/itinerary`                   | JWT    |                            | `ItineraryListDto` `{ myTrips, sharedTrips: [] }` |
| `POST` | `/itinerary`                   | JWT    | `ItineraryCreateBody`      | `ItinerarySavedDto`                               |
| `GET`  | `/itinerary/:sessionId`        | JWT    |                            | `ItineraryDto` (no `viewCount`)                   |
| `POST` | `/itinerary/:sessionId/update` | JWT    | `ItineraryUpdateBody`      | `ItinerarySavedDto`                               |
| `POST` | `/itinerary/:sessionId/delete` | JWT    | `{}`                       | `{ deleted: true }` (soft delete)                 |
| `GET`  | `/itinerary/v/:shortCode`      | public |                            | `PublicItineraryDto` or `{ hasChallenge: true }`  |
| `POST` | `/itinerary/challenge`         | public | `{ shortCode, challenge }` | `PublicItineraryDto`                              |

Paths changed Nov 2026 (fndom updated): `POST /edit/:sessionId` → `/:sessionId/update`, `POST /delete/:sessionId` → `/:sessionId/delete`. The unused stub `POST /add-collaborator` was removed.

### Request bodies

Text is trimmed and must fit its column (oversized → 400). Unknown fields are ignored (fndom posts its whole store, including GET fields such as `id`, `shortCode`, `files`).

**Absent vs blank (Nov 2026, user decision I2).** On update, a field that is **absent** from the body leaves the stored value unchanged; a field that is **sent blank** (`""` or `null`, an empty list for list fields) is stored as NULL. fndom posts the whole trip it loaded from the GET (round-trip), so a blank it sends is a value the user cleared. Details:

- Agenda fields with two spellings (`startTime`/`start_time`, `endTime`/`end_time`, `cityRaw`/`city_raw`, `listType`/`list_type`, `durationInHours`/`duration_in_hours`, `unknownTime`/`unknown_time`): the camelCase one wins whenever it was sent, even blank (a cleared time picker sends `startTime: null` next to the GET's old `start_time`).
- `date` sent blank with no `day` in the body also clears `day`: that is how fndom moves an item back to "unscheduled" (`date: ""`, `day` undefined), and `day` wins over `date` in fndom's grouping. A `day` that was sent is kept (undated trips send `day: 3, date: ""`).
- `coordinates: null` clears both coordinate columns.
- `0` still means "not set" for agenda `budget` / `durationInHours` / `day` and the trip's `startDate` / `endDate` (stored as NULL). Booking `nights` / `price` keep a real 0.
- Columns that can't be NULL: a blank `title` / `item` / `label` is stored as `""`, a blank `numberOfPax` / `durationInDays` as 1, a blank packing `category` as `misc`, a blank booking `sortOrder` as 0, a `null` flag as false.
- Create: absent fields get the column default (`numberOfPax` / `durationInDays` 1, flags 0, packing category `misc`, booking `sortOrder` 0), blank ones NULL.
- A child sent with only its `id` changes nothing.

**`ItineraryCreateBody`**

| Field                                                  | Type / limit             | Notes                                                                                                   |
| ------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `sessionTitle`                                         | string 1–512             | required                                                                                                |
| `idempotencyKey`                                       | string ≤ 64              | optional; same caller + same key returns the trip it created (`agendaToFileMap` with empty `fileUuids`) |
| `destination`                                          | string ≤ 512             |                                                                                                         |
| `destinationRaw`, `itineraryDateRaw`, `paxNames`       | string[]                 | stored as JSON                                                                                          |
| `country`                                              | string ≤ 256             |                                                                                                         |
| `numberOfPax`, `durationInDays`                        | integer ≥ 0              | 0/absent → 1                                                                                            |
| `startDate`, `endDate`                                 | integer (ms epoch)       |                                                                                                         |
| `unknownDate`                                          | boolean                  |                                                                                                         |
| `challenge`                                            | string ≤ 6 (not trimmed) | access code; blank = none                                                                               |
| `agendaItems`, `bookings`, `packingItems`, `noteItems` | arrays, see below        |                                                                                                         |

**`ItineraryUpdateBody`**: the same fields (all optional, absent = unchanged; `sessionTitle` blank keeps the title) plus:

| Field                                                                                  | Notes                                                          |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `challenge`                                                                            | absent → unchanged; `null` or `""` → removed; string ≤ 6 → set |
| `paxNames`                                                                             | absent → unchanged; `[]` / `null` → cleared                    |
| `_agendaIdsToDelete`, `_bookingIdsToDelete`, `_packingIdsToDelete`, `_noteIdsToDelete` | ids (numbers or digit strings), soft-deleted within this trip  |
| `_agendaIdsToUpdate`                                                                   | ignored: every agenda item with an `id` is updated             |

Children: an `id` (number or digit string) updates that row, no `id` inserts a new one.

| Child              | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agenda item        | `id?`, `title` ≤ 512 (may be blank), `category` ≤ 32, `listType` `todo`\|`place`, `desc` (text), `city` ≤ 512, `cityRaw` string[] (or the stored JSON string), `coordinates {lat ±90, lng ±180}`, `startTime` / `endTime` `"HH:MM"`, `durationInHours` 0–9999.99, `unknownTime` boolean (or 0/1), `budget` DECIMAL(12,2), `day` integer, `date` ≤ 32, `_filesToInsert[]`. snake_case variants returned by the GET (`list_type`, `city_raw`, `start_time`, `end_time`, `duration_in_hours`, `unknown_time`) are accepted, and DECIMALs may be numeric strings. |
| `_filesToInsert[]` | `uuid` ≤ 36 (the `uuid` sent to `/img/upload`), `tgShortCode` ≤ 16 (an existing upload of the caller's, see Image ownership), `mimeType` ≤ 100 and `image/*`, `name?` ≤ 255, `sizeInBytes?` integer. All required fields present or 400.                                                                                                                                                                                                                                                                                                                      |
| booking            | `id?`, `item` ≤ 512, `category` ≤ 32, `remarks` ≤ 128 (stored in `location`), `link` ≤ 1024, `payment` ≤ 256, `startDate` / `endDate` ≤ 32, `nights` integer, `price` DECIMAL(12,2), `booked`, `breakfast` booleans, `freeCancellation` ≤ 256, `deposit` ≤ 128, `paxBreakdown` object (JSON), `sortOrder` integer (default 0)                                                                                                                                                                                                                                 |
| packing item       | `id?`, `label` ≤ 255, `category` ≤ 50 (default `misc`), `packed` boolean, `quantity` integer. Sort order = position in the list.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| note item          | `id?`, `label` ≤ 255, `category` ≤ 64, `url` ≤ 512, `done` boolean. Sort order = position in the list.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Responses

- `ItinerarySummaryDto` = `{ id, sessionId, sessionTitle, destination, startDate, endDate, numberOfPax, shortCode }` (newest first).
- `ItinerarySavedDto` = `{ shortCode, sessionId, agendaToFileMap: [{ agendaId, fileUuids }] }`: one entry per request agenda item, **in request order** (fndom assigns `agendaId` back by index). `fileUuids` = the uuids listed in that item's `_filesToInsert`.
- `ItineraryDto` (owner) = `{ id, sessionId, sessionTitle, shortCode, destination, destinationRaw (JSON string), country, numberOfPax, itineraryDateRaw (JSON string), startDate, endDate, unknownDate, durationInDays, challenge, paxNames[], bookings[], packingItems[], noteItems[], agendaItems[] }`.
  - booking `{ id, itineraryId, category, item, remarks, link, payment, startDate, endDate, nights, price?, booked, freeCancellation, breakfast, deposit, paxBreakdown?, sortOrder }`
  - packing `{ id, label, category, packed, quantity? }`; note `{ id, label, category?, url?, done }`
  - agenda item (**snake_case**, see Contract notes) `{ id, itinerary_id, category, list_type, title, desc, city, city_raw, start_time?, end_time? ("HH:MM"), duration_in_hours, unknown_time (0/1), budget, day, date, coordinates?: {lat, lng}, files[] }`; `duration_in_hours` / `budget` are numbers or `null` (DECIMAL read through `toDecimalNumber`; were DECIMAL strings until Nov 2026).
  - file `{ id, uuid, name, mime_type, size_in_bytes, tg_short_code }`
- `PublicItineraryDto` (`/v/:shortCode`, `/challenge`) = `ItineraryDto` **without** `id`, `sessionId`, `challenge`, booking `id` / `itineraryId`, packing and note `id`, agenda `itinerary_id` and file `id`, **plus** `viewCount`. Agenda item `id` is kept: fndom's ICS export (`useTravelExport`) uses it as the stable event UID, so re-importing a trip updates events instead of duplicating them. (Removed Nov 2026, user decision I3; the viewer reads none of the removed fields.)

### Errors

| Status | When                                                                                                 | `data.code`                                                              |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 400    | bad / oversized field, non-image file, wrong access code                                             | `invalid_request_<field>` (`invalid_request_challenge` for a wrong code) |
| 401    | owner route without a valid session                                                                  | `token_invalid` (TokenFilter)                                            |
| 400    | `tgShortCode` unknown or deleted                                                                     | `invalid_request_tgShortCode`                                            |
| 403    | someone else's trip; child id from another trip; image uploaded by someone else; missing CSRF header | `forbidden_access` / `csrf_invalid`                                      |
| 404    | trip missing or deleted                                                                              | `entity_not_found`                                                       |
| 429    | 10 failed `POST /challenge` in 15 min from this IP                                                   | (limiter body)                                                           |

### Contract notes

- Agenda items and files stay snake_case: TravelPlannerView, TravelViewerView, TravelMapView, AgendaDrawer, useTravelDayGroups, useTravelExport and useCityLabel read `start_time`, `unknown_time`, `city_raw`, `list_type`, `tg_short_code` directly, and the planner posts them back. Converting them is a multi-component fndom change, not done here.
- `destinationRaw` / `itineraryDateRaw` are returned as the stored JSON strings (fndom `JSON.parse`s them).

### Known gaps (deliberately unchanged)

- Images uploaded before `tb_tg_image.created_by_id` existed (migration `20261126000200`) have no known uploader and can be attached by anyone (`/img/:shortCode` is public anyway).

DB: `tb_travel_itinerary`, `tb_travel_agenda_item`, `tb_travel_agenda_file`, `tb_travel_itinerary_booking`, `tb_travel_itinerary_view`, `tb_travel_packing_item`, `tb_travel_note_item`.
