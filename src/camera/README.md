## Camera relay

- Live previews and remote start/stop for phones running the recorder app (`fndom-react-native`), viewed and controlled from the fndom `/camera` dashboard. Recordings never leave the phone: only preview JPEGs (~12 fps, 480p), status and commands pass through.
- **Frozen contract.** The wire protocol (REST shapes, WebSocket messages, close codes, paths) is specified in [`docs/camera-protocol.md`](../../docs/camera-protocol.md) and mirrored in fndom and fndom-react-native. Change all three together.
- **Live state is in memory** (`CameraRelay`: sockets, latest frame and status per device; `PairingCodeStore`: pairing codes). That only works with a **single PM2 process**: a second process would not see the first one's sockets or codes. A restart drops every socket (clients reconnect with backoff) and unclaimed codes (the phone re-registers); device ↔ user bindings survive in `tb_camera_device`.

| File                   | Role                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `Camera.controller.ts` | REST routes (`route()` + validators)                                                             |
| `Camera.service.ts`    | `CameraService`, owns `tb_camera_device`; `toCameraDeviceDto`                                    |
| `Camera.validator.ts`  | Body/param validation; device token / id shape checks                                            |
| `Camera.types.ts`      | `CameraDeviceDto`, `CameraRegisterDto`, `CameraDeviceRemovedDto`, `CameraDeviceIdentity`, bodies |
| `Camera.pairing.ts`    | In-memory pairing codes                                                                          |
| `Camera.protocol.ts`   | Wire constants (paths, close codes, sizes) and sanitisers for every client message               |
| `Camera.relay.ts`      | Pure relay logic over a `RelaySocket` interface (unit-tested with fakes)                         |
| `Camera.ws.ts`         | `ws` server on the Express server's `upgrade` event; auth; wires real sockets into the relay     |

---

### REST (mounted at `/camera` with `mw.std`; JWT per route)

| Method | Path                              | Auth                                                                                       | Body                          | Response (`data`)                                                                |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------- |
| `POST` | `/camera/device/register`         | public, `cameraRegisterLimiter` 30/h/IP, Telegram-silent                                   | `{ name, deviceId?, token? }` | `CameraRegisterDto` `{ deviceId, token, paired, pairingCode, pairingExpiresAt }` |
| `POST` | `/camera/device/claim`            | JWT + CSRF; `cameraClaimIpLimiter` 10 and `cameraClaimUserLimiter` 5 **failures** / 15 min | `{ code, name? }`             | `CameraDeviceDto`                                                                |
| `GET`  | `/camera/device`                  | JWT                                                                                        |                               | `CameraDeviceDto[]` (active, oldest pairing first)                               |
| `POST` | `/camera/device/:deviceId/delete` | JWT + CSRF                                                                                 | `{}`                          | `CameraDeviceRemovedDto` `{ deviceId }`                                          |

`CameraDeviceDto` = `{ deviceId, name, online, pairedAt: number | null, lastSeenAt: number | null }` (`online` = has a live socket now).

- **register**: `name` required, control characters removed, trimmed, 1–60 chars (`tb_camera_device.name` VARCHAR(60)). `deviceId` (UUID) + `token` (base64url, 20–100 chars) are all-or-nothing; malformed or unknown credentials, or those of a bound device whose owner's account is soft-deleted, are ignored and the phone gets a **new** device. A new device gets a fresh 32-byte token, returned **once** (only its SHA-256, `sha256Hex`, is stored); a known one gets `token: null`. An unbound device also gets a new 6-digit `pairingCode` (replacing its previous one, 10 min TTL); a bound one gets `paired: true` and no code. Each new registration first retires unclaimed devices older than 24 h.
- **claim**: `code` = 6 digits (spaces ignored, the phone shows `123 456`). The code is consumed on the first attempt. Unknown/expired code, or a device that was bound/removed meanwhile → 400 `invalid_request_code`. Optional `name` (same rules as register; blank keeps the phone's name) renames the device. On success the phone (if connected) gets `{ type: "paired", name }` and the user's dashboards get `device_online`.
- **delete**: owner only; soft delete, revokes its pairing code, tells dashboards `device_removed` and closes the phone's socket with `4401` (the phone re-registers as a new device).

##### Errors

| Status | When                                                    | `data.code` / `status`                  |
| ------ | ------------------------------------------------------- | --------------------------------------- |
| 400    | bad `name` / `code` / `deviceId`; wrong or expired code | `invalid_request_<field>`               |
| 401    | no / invalid / revoked session                          | `status: "token_invalid"` (TokenFilter) |
| 403    | missing CSRF header on claim/delete                     | `status: "csrf_invalid"` (TokenFilter)  |
| 404    | delete of a device that isn't yours or doesn't exist    | `entity_not_found`                      |
| 429    | rate limit (fndom shows "too many attempts" on claim)   | limiter body                            |
| 500    | pairing-code memory cap (10 000 live codes) reached     | `entity_creation_failed`                |

fndom reads: `data` of list/claim (`CameraDevice`), and only the HTTP status of a failed claim (429 vs anything else). The phone reads `deviceId`, `token`, `paired`, `pairingCode`, `pairingExpiresAt` and only checks for HTTP 200.

### WebSockets (`Camera.ws.ts`)

| Path                   | Who     | Auth                                                                                                                                                             |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/camera/ws/phone`     | phone   | `Authorization: Bearer <device token>` → active device whose owner (if bound) has an active user row (else 401; a soft-deleted owner = unknown token)            |
| `/camera/ws/dashboard` | browser | `Origin` ∈ `ALLOWED_ORIGINS` (else 403; stands in for CSRF) and the `jwt_token` cookie via `resolveSessionUser` (same check as `MandatoryTokenFilter`; else 401) |

Any other upgrade path → 404; an unparseable one (`//`) → 400; a failing lookup (DB down) → 500.

- Relay rules (`Camera.relay.ts`): frames from unbound phones are dropped; only the latest frame per device is kept; per dashboard and device one frame in flight + one waiting (newest wins); dashboards with > 1 MB buffered get nothing new; status and acks are whitelisted by `Camera.protocol.ts`; commands only reach the user's own online phones (a foreign target is reported `offline`, indistinguishable from an offline one).
- Limits: frames ≤ 512 KB (payloads over 512 KB + 1 KB close the socket, 1009); JSON text ≤ 8 KB (larger text frames are dropped before decoding); invalid UTF-8 text closes the socket (1007, `ws`).
- Heartbeat: ping every 25 s (`CAMERA_HEARTBEAT_MS`, under nginx's 60 s read timeout); a socket that missed the previous pong is terminated.
- Close codes: `4000` replaced by a newer connection of the same device, `4401` device removed / credentials invalid, `1011` the server failed setting up the socket (client reconnects).
- **Crash safety:** every callback nobody awaits (`upgrade`, `message`, `close`, `error`, the heartbeat timer, `touch()` promises) is wrapped (`guard()` / `.catch`) and logs instead of throwing. A bad client can get its own socket closed, never take the process down. `Camera.ws.test.ts` feeds malformed upgrades, frames and messages and throwing handlers and asserts there is no uncaught exception or unhandled rejection.
- Connect/disconnect of phones is logged (`camera` tag) and stamps `last_seen_dt`; a failing stamp is only logged.

DB: `tb_camera_device` (migration `20261114000000`): `uuid`, `token_hash` (SHA-256 hex), `user_id` (null until claimed), `name`, `paired_dt`, `last_seen_dt`, soft delete.

Tests: `Camera.test.ts` (validators, mapper, sanitisers, service rules, REST in-process incl. limiters/CSRF), `Camera.relay.test.ts`, `Camera.pairing.test.ts`, `Camera.ws.test.ts` (real sockets on an ephemeral local port).
