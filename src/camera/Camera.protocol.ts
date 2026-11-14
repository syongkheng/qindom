// Camera relay wire protocol — see docs/camera-protocol.md (mirrored in fndom and fndom-react-native).

export const CAMERA_WS_PHONE_PATH = "/camera/ws/phone";
export const CAMERA_WS_DASHBOARD_PATH = "/camera/ws/dashboard";

export const CAMERA_CLOSE_REPLACED = 4000;
export const CAMERA_CLOSE_UNAUTHORISED = 4401;

/** Largest preview frame accepted from a phone. */
export const CAMERA_MAX_FRAME_BYTES = 512 * 1024;
/** Largest JSON text message accepted from either side. */
export const CAMERA_MAX_TEXT_BYTES = 8 * 1024;
/** A dashboard whose socket buffer exceeds this gets no new frames until it drains. */
export const CAMERA_MAX_DASHBOARD_BUFFER = 1024 * 1024;

export const CAMERA_QUALITIES = ["4k", "1080p"] as const;
export type CameraQuality = (typeof CAMERA_QUALITIES)[number];

export const CAMERA_COMMANDS = ["start", "stop", "set_quality"] as const;
export type CameraCommandType = (typeof CAMERA_COMMANDS)[number];

const THERMAL_STATES = ["nominal", "fair", "serious", "critical"] as const;

export interface CameraStatus {
  recording: boolean;
  startedAtMs: number | null;
  elapsedMs: number;
  quality: CameraQuality;
  batteryLevel: number | null;
  charging: boolean;
  freeBytes: number;
  thermalState: (typeof THERMAL_STATES)[number];
  droppedFrames: number;
  hasAudio: boolean;
  previewFps: number;
}

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const finiteOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Whitelists and type-checks a phone's status so only known fields reach dashboards. */
export function sanitiseStatus(raw: unknown): CameraStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  return {
    recording: s.recording === true,
    startedAtMs: finiteOrNull(s.startedAtMs),
    elapsedMs: Math.max(0, finiteOr(s.elapsedMs, 0)),
    quality: CAMERA_QUALITIES.includes(s.quality as CameraQuality) ? (s.quality as CameraQuality) : "4k",
    batteryLevel: finiteOrNull(s.batteryLevel),
    charging: s.charging === true,
    freeBytes: Math.max(0, finiteOr(s.freeBytes, 0)),
    thermalState: THERMAL_STATES.includes(s.thermalState as (typeof THERMAL_STATES)[number])
      ? (s.thermalState as CameraStatus["thermalState"])
      : "nominal",
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

export function sanitiseAck(raw: Record<string, unknown>): CameraAck | null {
  if (!CAMERA_COMMANDS.includes(raw.command as CameraCommandType)) return null;
  return {
    command: raw.command as CameraCommandType,
    requestId: clipString(raw.requestId, 64),
    ok: raw.ok === true,
    error: clipString(raw.error, 200),
    startedAtMs: finiteOrNull(raw.startedAtMs),
  };
}

export interface CameraCommand {
  type: CameraCommandType;
  target: string;
  requestId: string | null;
  quality?: CameraQuality;
}

export function parseCommand(raw: Record<string, unknown>): CameraCommand | null {
  if (!CAMERA_COMMANDS.includes(raw.type as CameraCommandType)) return null;
  if (typeof raw.target !== "string" || raw.target.length === 0 || raw.target.length > 64) return null;
  const command: CameraCommand = {
    type: raw.type as CameraCommandType,
    target: raw.target,
    requestId: clipString(raw.requestId, 64),
  };
  if (command.type === "set_quality") {
    if (!CAMERA_QUALITIES.includes(raw.quality as CameraQuality)) return null;
    command.quality = raw.quality as CameraQuality;
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
  return Buffer.concat([Buffer.from([id.length]), id, jpeg]);
}
