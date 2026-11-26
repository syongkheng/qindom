# Analytics `/analytics`

Page-view analytics for every frontend (fndom, jessikheng, the PDCA website), a per-system dashboard in fndom, and the private report the PDCA site's `/insights` page reads. Two routers share the prefix (both `mw.std` in `app.ts`): the deprecated legacy ingest first, then v1.

| File | Role |
|---|---|
| `Analytics.controller.ts` | v1 routes: `/collect`, `/report`, `/systems*`, `/admin/*` |
| `AnalyticsLegacy.controller.ts` / `.service.ts` | deprecated `POST /` and `POST /heartbeat` |
| `AnalyticsSystem.service.ts` | registry (`tb_analytic_system`), 60 s in-memory cache, `toRegisteredSystem` |
| `AnalyticsDashboard.service.ts` | `/collect` ingest + hourly summary (`tb_analytic_event`) |
| `AnalyticsReport.ts` / `AnalyticsReport.service.ts` | report contract: pure validation/periods/aggregation + queries, viewer-key check |
| `AnalyticsAccess.service.ts` | who may view which system (OWNER or a resource grant via `PermissionService`) |
| `AnalyticsContract.ts` | ingest contract v1: screen resolution, origin check, normalisation |
| `Analytics.validator.ts` | hand-written request validation (replaced zod in Nov 2026, same accept/reject behaviour) |
| `Analytics.types.ts` | DTOs, bodies, contract enums |

All responses use the usual envelope `{ code, status, data }`. Errors use the registry shape `data = { code, message, fieldName, typeOfError, timestamp }`, except the report's 400 (below).

---

## Public routes (frozen contracts)

### `POST /analytics/collect` — ingest, contract v1

Public (`OptionalTokenFilter`: a logged-in user's username is stored, otherwise NULL). `analyticsLimiter` 120/min/IP. Not sent to Telegram (`RestRequestLogger` skip list).

```json
{
  "v": 1,
  "system": "jessikheng",
  "event": "page_view",
  "sessionId": "uuid",
  "timestamp": 1763540000000,
  "page": "/#/status",
  "referrer": "",
  "screen": { "width": 390, "height": 844, "breakpoint": "phone", "size": "small" },
  "properties": {}
}
```

| Field | Rule |
|---|---|
| `v` | exactly `1` |
| `system` | `^[a-z0-9][a-z0-9-]{0,63}$`, must be an active `tb_analytic_system` row |
| `event` | snake_case `^[a-z][a-z0-9_]{0,63}$`; `page_view` drives the dashboard |
| `sessionId` | 1–64 chars |
| `timestamp` | optional whole number ≥ 0 (epoch ms); more than 24 h from server time → server time |
| `page`, `referrer` | optional, ≤ 512 chars, default `""` |
| `screen` | optional; `width`/`height` whole numbers 0–100000; `breakpoint` ≤ 32 chars; `size` ≤ 16 chars |
| `properties` | optional plain object, default `{}`, ≤ 4096 bytes as JSON |

Lengths count Unicode characters (an emoji is one). Unknown keys are ignored. `screen.breakpoint` must be one of the system's keys, else it's stored as `unknown`; `screen.size` is kept if it is `small | medium | large`, else derived from the breakpoint, else `unknown`.

Response: `{ "message": "Event recorded successfully." }`.

| Status | `data.code` | When |
|---|---|---|
| 400 | `invalid_request_<field>` (`typeOfError: "format"`) | first failing field, as a path: `v`, `screen.width`, `properties`, or `body` when the body isn't an object |
| 400 | `invalid_request_system` | system unknown or disabled |
| 403 | `forbidden_access` | the system has `allowed_origins` and the `Origin` header isn't one of them (no `Origin` header passes) |
| 429 | | rate limit |

### `POST /analytics/report` — `pdca.analytics.report/v1` (PDCA `/insights`)

No login (the PDCA site has no accounts). Header `x-analytics-key: <viewer key>` must match `tb_analytic_system.read_key_hash` (sha256 hex, timing-safe), and the `Origin` must be in the system's `allowed_origins`. `site` → system via `REPORT_SITES` (`pdcadental.com` → `dental-directory`). `analyticsReportLimiter` 30/min/IP.

Request (exact keys, no others): `{ contract: "pdca.analytics.report/v1", site: "pdcadental.com", timezone: "Asia/Singapore", period: { start, end }, compare: "previous_month", metrics[], breakdowns[], limit (1–20) }`; period ≤ 366 days.

Response: `{ contract, source: "qindom", generatedAt, period, comparePeriod, totals, series, breakdowns }`.

- `visitors` = distinct `properties.visitorId` (or `session_id`); `newVisitors` = first-ever event in the period.
- Counts: `page_view`, `whatsapp_click`, `call_click`, `email_click`, `directions_click`, `file_download`, `generate_lead`; `enquiries` = whatsapp + call + email + form.
- Breakdowns: source (referrer of each visitor's first event: Google search, Google Maps, Instagram, Facebook, LinkedIn, TikTok, Other sites, Direct; the site's own hosts count as Direct), page (`page_view` by path), device (last `screen_size`: small = mobile, medium = tablet, large = desktop); tails beyond `limit` collapse into "Other".
- Periods are Singapore dates. Not measurable: `country`/`searchTerm` → `[]`, `listing*` → 0.

| Status | Body | When |
|---|---|---|
| 400 | `status: "Bad Request"`, `data: { message: "Request rejected", problems: [...] }` | invalid request; messages match the PDCA site's own validator (frozen shape, not the registry error) |
| 403 | `forbidden_access` | the SAME response for unknown site/system, disallowed origin, missing or wrong key |
| 429 | | rate limit |

An OWNER rotates the key with `POST /analytics/admin/systems/:key/read-key` and shares `https://<pdca-site>/insights?key=<key>`.

### Legacy (deprecated, kept so nothing breaks)

Public, `OptionalTokenFilter`. Only presence is checked.

- `POST /analytics` `{ event, sessionId, system, properties?, page?, referrer?, timestamp? (ms or ISO string) }` → `{ "message": "Event recorded successfully." }`. Missing field → 400 `invalid_request_event|sessionId|system` (in that order). No known caller left.
- `POST /analytics/heartbeat` `{ sessionId, system }` → `{ "message": "Heartbeat recorded successfully." }`; upserts `tb_analytic_user_activity` by `session_id` (user = username or `Anonymous`). fndom sends it every 30 s. Not sent to Telegram.
- A DB failure on either is 500 `entity_creation_failed`.

---

## Dashboard reads (JWT, `MandatoryTokenFilter`)

- `GET /analytics/systems` → `[{ key, displayName, breakpoints }]`: every active system for OWNER (SYSTEM_R5), otherwise only systems with an active grant in `tb_aa_resource_access`.
- `GET /analytics/systems/:key/summary?hours=24` → `{ system, range: { from, to, bucket: "hour", hours }, views: { total, uniqueSessions, series[{ t, views, sessions }] }, breakpoints[{ key, label, views, sessions }], sizes[...], topPages[{ page, views }] }`. `hours` is lenient: missing/invalid → 24, clamped to 1–168. 403 `forbidden_access` for "not granted", unknown and disabled keys alike (keys can't be probed).

## Owner administration (JWT + SYSTEM_R5, `adminLimiter` 60/15 min)

Non-owner → 403 `forbidden_access` ("Insufficient permissions"). POSTs need the CSRF header. Grants never confer roles.

| Route | Body | Response | Errors |
|---|---|---|---|
| `POST /admin/systems/:key/read-key` | `{}` | `{ readKey }` (shown once; only its hash is stored, the old key stops working) | 404 unknown system |
| `GET /admin/systems` | | `[{ key, displayName, breakpoints, allowedOrigins, active }]` incl. disabled | |
| `POST /admin/systems` | `{ key, displayName (trimmed, 1–128), breakpoints (1–12 of { key ^[A-Za-z0-9_-]{1,32}$, label 1–64, maxWidth positive int or null, size small/medium/large }), allowedOrigins? (≤ 20, `^https?://host[:port]$`, default []), active? (default true) }` | the full list | 400 `invalid_request_<path>` (e.g. `breakpoints.0.key`) |
| `GET /admin/systems/:key/access` | | `[{ userId, username, email, system, accessLevel, grantedDt }]` | |
| `POST /admin/systems/:key/access` | `{ username }` (an awense.com `fnd` account) | the grant list | 404 unknown system (checked first), 400 `invalid_request_username`, 404 "No awense.com account with that username" |
| `POST /admin/systems/:key/access/:userId/revoke` | `{}` | the grant list | 400 `invalid_request_userId` |

fndom `/admin/analytics-access` manages viewers and allowed origins; `/analytics` shows the dashboards.

## Adding a site

Create its row with `POST /analytics/admin/systems`, add its origin to `allowedOrigins` (and to `ALLOWED_ORIGINS` for CORS), then send the collect payload above.

| system | Frontend |
|---|---|
| `fndom` | awense.com |
| `jessikheng` | wedding site |
| `dental-directory` | PDCA dental lab site |
