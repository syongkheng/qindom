## Analytics Controller

- `POST /api/analytics` — ingest a structured event from any frontend system
- `POST /api/analytics/heartbeat` — legacy session-activity ping (kept for compatibility)
- Authentication is optional on both routes — anonymous sessions are accepted

The base `POST /api/analytics` endpoint mirrors the mock server's `POST /analytics` path, so
frontends switch between dev (`http://localhost:3000/analytics`) and production
(`https://<qindom-host>/api/analytics`) by changing only `VITE_ANALYTICS_ENDPOINT`.

------------------------------------------------------------------------------------------

#### Ingest an analytics event

<details>
 <summary><code>POST</code> <code>/api/analytics</code></summary>

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
 <summary><code>POST</code> <code>/api/analytics/heartbeat</code></summary>

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
