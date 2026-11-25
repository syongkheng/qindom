## Analytics Controller

### v1 (use this) — `POST /analytics/collect`

One fixed shape for every frontend; the schema lives in `AnalyticsContract.ts`.

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

- `system` must be an active row in `tb_analytic_system` (else 400). If the row has `allowed_origins`, the `Origin` header must match (else 403).
- `screen.breakpoint` is the site's own breakpoint key from that row; unknown keys are stored as `unknown`.
- `screen.size` is `small | medium | large`; if missing/invalid it is derived from the breakpoint's mapping.
- `event` is snake_case; `page_view` drives the dashboard. `properties` ≤ 4KB. Rate limit 120/min/IP.
- Dashboard reads: `GET /analytics/systems`, `GET /analytics/systems/:key/summary?hours=24` (login; SYSTEM_R5 or a grant in `tb_aa_resource_access`).

### Report — `POST /analytics/report` (PDCA website `/insights`)

Takes a `pdca.analytics.report/v1` request (the PDCA site's `buildRequest()`) and returns the v1 response with `source: "qindom"`, wrapped in the usual `{ code, status, data }` envelope. Validation, periods and aggregation live in `AnalyticsReport.ts`; queries in `AnalyticsReport.service.ts`.

- **Auth:** there is no login, because the PDCA site has no accounts. The header `x-analytics-key: <viewer key>` must match `tb_analytic_system.read_key_hash` (sha256, timing-safe), and the `Origin` must be in `allowed_origins`. Every failure gets the same 403. An OWNER rotates the key with `POST /analytics/admin/systems/:key/read-key`, which returns the plain key once and invalidates the old one. Share it as `https://<pdca-site>/insights?key=<key>`.
- **Validation:** a bad request gets a 400 with `data.problems[]`. The messages match the frontend validator.
- **Data:** events from `tb_analytic_event` for the site's system, counted on Singapore dates.
  - `visitors` = distinct `properties.visitorId` (or `session_id` when there is none). `newVisitors` = visitors whose first-ever event falls in the period.
  - Event counts: `page_view`, `whatsapp_click`, `call_click`, `email_click`, `directions_click`, `file_download` and `generate_lead`. `enquiries` = whatsapp + call + email + form.
  - Breakdowns:
    - source: the referrer of each visitor's first event in the period, classified as Google search, Google Maps, Instagram, Facebook, LinkedIn, TikTok, Other sites or Direct
    - page: `page_view` by path
    - device: each visitor's last `screen_size` (small = mobile, medium = tablet, large = desktop)
    - tails beyond `limit` collapse into "Other"
- **Not measurable:** `country` and `searchTerm` come back as `[]`, and `listing*` as 0. Rate limit 30/min/IP.

To add a site: create its registry row with `POST /analytics/admin/systems` (SYSTEM_R5; body `{key, displayName, breakpoints, allowedOrigins, active}`), then send the payload above. fndom `/admin/analytics-access` manages viewers and allowed origins for existing rows.

### Legacy (deprecated, kept so nothing breaks)

- `POST /analytics` — ingest a structured event from any frontend system
- `POST /analytics/heartbeat` — legacy session-activity ping (kept for compatibility)
- Authentication is optional on both routes — anonymous sessions are accepted

The base `POST /analytics` endpoint mirrors the mock server's `POST /analytics` path, so
frontends switch between dev (`http://localhost:3000/analytics`) and production
(`https://<qindom-host>/analytics`) by changing only `VITE_ANALYTICS_ENDPOINT`.

------------------------------------------------------------------------------------------

#### Ingest an analytics event

<details>
 <summary><code>POST</code> <code>/analytics</code></summary>

Header: Authorization: Bearer &lt;Token&gt;  (optional)

##### Payload
```json
{
    "event":      "string",            // e.g. "page_view", "button_click"
    "properties": { },                 // event-specific metadata (any JSON object)
    "page":       "string",            // e.g. "/services"
    "referrer":   "string",
    "sessionId":  "string",
    "timestamp":  "ISO-8601 string",   // e.g. "2026-06-26T10:00:00.000Z"
    "system":     "string"             // e.g. "llm" | "travel-planner" | "dental-directory"
}
```

##### Response
```json
{ "code": 200, "status": "Ok", "data": { "message": "Event recorded successfully." } }
```
</details>

------------------------------------------------------------------------------------------

#### Record a heartbeat (legacy)

<details>
 <summary><code>POST</code> <code>/analytics/heartbeat</code></summary>

Header: Authorization: Bearer &lt;Token&gt;  (optional)

##### Payload
```json
{
    "sessionId": "string",
    "system":    "string"
}
```

##### Response
```json
{ "code": 200, "status": "Ok", "data": { "message": "Heartbeat recorded successfully." } }
```
</details>

------------------------------------------------------------------------------------------

### Known system identifiers

| system             | Frontend             |
|--------------------|----------------------|
| `dental-directory` | PDCA dental lab site |
| `travel-planner`   | fndom travel planner |
| `llm`              | LLM chat interface   |
