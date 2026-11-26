// Camera relay wire protocol — see docs/camera-protocol.md (mirrored in fndom and fndom-react-native).

export const CAMERA_WS_PHONE_PATH = "/camera/ws/phone";
export const CAMERA_WS_DASHBOARD_PATH = "/camera/ws/dashboard";

/** Close codes (application range 4000–4999), see docs/camera-protocol.md. */
export const CAMERA_CLOSE_REPLACED = 4000;
export const CAMERA_CLOSE_UNAUTHORISED = 4401;
/** Standard "internal error" close: the server failed handling this socket; the client reconnects. */
export const WS_CLOSE_INTERNAL_ERROR = 1011;

/** Largest preview frame accepted from a phone. */
export const CAMERA_MAX_FRAME_BYTES = 512 * 1024;
/** Largest JSON text message accepted from either side. */
export const CAMERA_MAX_TEXT_BYTES = 8 * 1024;
/** A dashboard whose socket buffer exceeds this gets no new frames until it drains. */
export const CAMERA_MAX_DASHBOARD_BUFFER = 1024 * 1024;
/** Longest `target` (a deviceId or "all") and echoed `requestId`. */
export const CAMERA_MAX_TARGET_LENGTH = 64;
export const CAMERA_MAX_REQUEST_ID_LENGTH = 64;
/** Longest `error` text forwarded from a phone's ack. */
export const CAMERA_MAX_ACK_ERROR_LENGTH = 200;
/** Frame packets prefix the deviceId with its length in one byte. */
const FRAME_DEVICE_ID_MAX_BYTES = 255;

export const CAMERA_QUALITIES = ["4k", "1080p"] as const;
export type CameraQuality = (typeof CAMERA_QUALITIES)[number];
const DEFAULT_QUALITY: CameraQuality = "4k";

export const CAMERA_COMMANDS = ["start", "stop", "set_quality"] as const;
export type CameraCommandType = (typeof CAMERA_COMMANDS)[number];

const THERMAL_STATES = ["nominal", "fair", "serious", "critical"] as const;
type CameraThermalState = (typeof THERMAL_STATES)[number];
const DEFAULT_THERMAL_STATE: CameraThermalState = "nominal";

export interface CameraStatus {
  recording: boolean;
  startedAtMs: number | null;
  elapsedMs: number;
  quality: CameraQuality;
  batteryLevel: number | null;
  charging: boolean;
  freeBytes: number;
  thermalState: CameraThermalState;
  droppedFrames: number;
  hasAudio: boolean;
  previewFps: number;
}

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const finiteOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

/** Whitelists and type-checks a phone's status so only known fields reach dashboards. */
export function sanitiseStatus(raw: unknown): CameraStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  return {
    recording: s.recording === true,
    startedAtMs: finiteOrNull(s.startedAtMs),
    elapsedMs: Math.max(0, finiteOr(s.elapsedMs, 0)),
    quality: isOneOf(CAMERA_QUALITIES, s.quality) ? s.quality : DEFAULT_QUALITY,
    batteryLevel: finiteOrNull(s.batteryLevel),
    charging: s.charging === true,
    freeBytes: Math.max(0, finiteOr(s.freeBytes, 0)),
    thermalState: isOneOf(THERMAL_STATES, s.thermalState) ? s.thermalState : DEFAULT_THERMAL_STATE,
    droppedFrames: Math.max(0, finiteOr(s.droppedFrames, 0)),
    hasAudio: s.hasAudio === true,
    previewFps: Math.max(0, finiteOr(s.previewFps, 0)),
  };
}

const clipString = (value: unknown, max: number): string | null =>
  typeof value === "string" ? value.slice(0, max) : null;

export interface CameraAck {
  command: CameraCommandType;
  requestId: string | null;
  ok: boolean;
  error: string | null;
  startedAtMs: number | null;
}

/** Whitelists a phone's ack; null for an unknown command. */
export function sanitiseAck(raw: Record<string, unknown>): CameraAck | null {
  if (!isOneOf(CAMERA_COMMANDS, raw.command)) return null;
  return {
    command: raw.command,
    requestId: clipString(raw.requestId, CAMERA_MAX_REQUEST_ID_LENGTH),
    ok: raw.ok === true,
    error: clipString(raw.error, CAMERA_MAX_ACK_ERROR_LENGTH),
    startedAtMs: finiteOrNull(raw.startedAtMs),
  };
}

export interface CameraCommand {
  type: CameraCommandType;
  target: string;
  requestId: string | null;
  quality?: CameraQuality;
}

/** A dashboard command; null for an unknown type, a bad target or a missing/unknown quality. */
export function parseCommand(raw: Record<string, unknown>): CameraCommand | null {
  if (!isOneOf(CAMERA_COMMANDS, raw.type)) return null;
  const { target } = raw;
  if (typeof target !== "string" || target.length === 0 || target.length > CAMERA_MAX_TARGET_LENGTH) return null;
  const command: CameraCommand = {
    type: raw.type,
    target,
    requestId: clipString(raw.requestId, CAMERA_MAX_REQUEST_ID_LENGTH),
  };
  if (command.type === "set_quality") {
    if (!isOneOf(CAMERA_QUALITIES, raw.quality)) return null;
    command.quality = raw.quality;
  }
  return command;
}

/** Parses a JSON text message; null for oversize, malformed or type-less input. */
export function parseJsonMessage(text: string): Record<string, unknown> | null {
  if (text.length > CAMERA_MAX_TEXT_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.type === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Dashboard frame packet: [1 byte N][N bytes deviceId][JPEG]. */
export function encodeFramePacket(deviceId: string, jpeg: Buffer): Buffer {
  const id = Buffer.from(deviceId, "ascii");
  // deviceIds are server-issued UUIDs (36 bytes); a longer one would corrupt the length byte.
  if (id.length > FRAME_DEVICE_ID_MAX_BYTES) throw new Error(`deviceId too long for a frame packet: ${id.length}`);
  return Buffer.concat([Buffer.from([id.length]), id, jpeg]);
}
