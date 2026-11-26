## Debug Controller

- Test-only endpoint for exercising the response/logging pipeline (request tree, Telegram alerts, Log Searcher).
- **Auth:** open in dev; in prd mounted behind `mw.auth` (JWT) and limited to `Roles.OWNER` (`SYSTEM_R5`).

---

#### Simulate a status code

<details>
 <summary><code>GET</code> <code>/debug/status/:code</code></summary>

##### Params

- `code`: integer 200–599. Anything else → 400 `InvalidRequestException`.

##### Behaviour

| `code`  | Response                                                                                 |
| ------- | ---------------------------------------------------------------------------------------- |
| 200–299 | `{ "code": <code>, "status": "Ok", "data": { "simulated": <code> } }` (`DebugStatusDto`) |
| 300–499 | `{ "code": <code>, "status": "debug_<code>", "data": "Simulated <code> response" }`      |
| 500     | Real thrown `Error` → generic 500 via `handleException` (stack in the request tree)      |
| 501–599 | `{ "code": <code>, "status": "Ko", "data": "Simulated <code> response" }`                |

Non-owner in prd → 403 `ForbiddenAccessException`.
</details>
