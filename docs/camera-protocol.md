# Camera relay protocol (v1)

Source of truth: `qindom/docs/camera-protocol.md`. Copies live in
`fndom/docs/camera-protocol.md` and `fndom-react-native/docs/camera-protocol.md`;
change all three together.

```
phone ──ws──▶ qindom relay ──ws──▶ fndom dashboard
      ◀─────────── commands ◀──────────
```

Recorded video never leaves the phone. Only preview JPEGs, status and commands
pass through the server. The server holds live state in memory; only the
device ↔ user binding is stored (`tb_camera_device`).

## REST (prefix `/camera`)

| Method | Path | Auth | Body → Response `data` |
|---|---|---|---|
| POST | `/camera/device/register` | none (rate-limited) | `{ name, deviceId?, token? }` → `{ deviceId, token, paired, pairingCode, pairingExpiresAt }` |
| POST | `/camera/device/claim` | user (cookie + CSRF), rate-limited | `{ code, name? }` → `CameraDeviceDto` |
| GET | `/camera/device` | user | → `CameraDeviceDto[]` |
| POST | `/camera/device/:deviceId/delete` | user | `{}` → `{ deviceId }` |

- **register** — a phone without credentials gets a new `deviceId` and a secret
  `token` (returned once; the server stores only its SHA-256). A phone that sends
  back valid credentials keeps its identity; `token` is then `null`.
  If the device is not yet bound to a user, a fresh 6-digit `pairingCode` is
  issued (replacing any previous one). Codes are single-use and expire after
  10 minutes. A bound device gets `paired: true` and no code.
- **claim** — binds the code's device to the logged-in user. Wrong/expired codes
  return 400 and count toward a limit of 5 failures per 15 min per user (and 10
  per IP). Codes and live connections live in memory: a server restart clears
  unclaimed codes (the phone simply re-registers), bindings survive.
- **delete** — unbinds and retires the device; its socket is closed with
  `4401` and the phone re-registers as a new device.

`CameraDeviceDto = { deviceId, name, online, pairedAt, lastSeenAt }`

## WebSockets

| Path | Who | Auth |
|---|---|---|
| `/camera/ws/phone` | phone | `Authorization: Bearer <device token>` header |
| `/camera/ws/dashboard` | browser | `jwt_token` cookie (same check as `MandatoryTokenFilter`) and `Origin` ∈ `ALLOWED_ORIGINS` |

The server pings every 25 s and drops sockets that miss a pong. Close codes:
`4000` replaced by a newer connection of the same device, `4401` credentials no
longer valid (re-register). Any other close: reconnect with backoff.

### Binary messages

- **phone → server**: one JPEG preview frame (≤ 512 KB), nothing else.
  Frames from a device not yet bound to a user are discarded.
- **server → dashboard**: `[1 byte N][N bytes deviceId, ASCII][JPEG bytes]`.

The server keeps only the latest frame per device and never queues: while a
frame is still being written to a dashboard, newer frames replace the waiting
one, and nothing is sent to a dashboard whose socket buffer exceeds 1 MB.

### JSON text messages

All have a `type`. Unknown types are ignored. `target` is a `deviceId` or `"all"`
(all of the user's devices). `requestId` is an optional client string, echoed
back in the matching `ack`.

**phone → server**

```jsonc
{ "type": "status", "status": Status }     // every 2 s, and on change
{ "type": "ack", "command": "start" | "stop" | "set_quality",
  "requestId": "…", "ok": true, "error": null,
  "startedAtMs": 1731500000123 }          // start: wall-clock ms of the file's first frame
```

**dashboard → server → phone** (the server strips `target`; the phone sees the rest)

```jsonc
{ "type": "start", "target": "all", "requestId": "r1" }
{ "type": "stop", "target": "<deviceId>", "requestId": "r2" }
{ "type": "set_quality", "target": "all", "quality": "4k" | "1080p", "requestId": "r3" }
```

**server → phone**

```jsonc
{ "type": "paired", "name": "iPhone 13" }   // a dashboard just claimed this device
```

**server → dashboard**

```jsonc
{ "type": "device_online", "deviceId": "…", "name": "…", "status": Status | null }
{ "type": "device_offline", "deviceId": "…" }
{ "type": "device_removed", "deviceId": "…" }
{ "type": "status", "deviceId": "…", "status": Status }
{ "type": "ack", "deviceId": "…", "command": "…", "requestId": "…", "ok": true,
  "error": null, "startedAtMs": 1731500000123 }
{ "type": "command_result", "requestId": "…", "sent": ["<deviceId>"], "offline": ["<deviceId>"] }
```

On connect, a dashboard receives `device_online` (and the latest frame) for each
of the user's devices that is online.

### Status

```jsonc
{
  "recording": true,
  "startedAtMs": 1731500000123,   // null when idle; capture time of first frame
  "elapsedMs": 61234,
  "quality": "4k",                // "4k" | "1080p"
  "batteryLevel": 0.82,           // 0–1, null if unknown
  "charging": true,
  "freeBytes": 51234567890,
  "thermalState": "nominal",      // nominal | fair | serious | critical
  "droppedFrames": 0,             // frames missing from the current file
  "hasAudio": true,
  "previewFps": 12
}
```

### Start offset between phones

A dashboard sends one `start` with `target: "all"` and a `requestId`. Each phone
replies with an `ack` carrying `startedAtMs`, the wall-clock capture time of its
first recorded frame. The spread of those values across devices is the start
offset. Phones keep their clocks in sync over NTP, typically to within a few
tens of ms. Treat the offset as approximate, not frame-accurate.
