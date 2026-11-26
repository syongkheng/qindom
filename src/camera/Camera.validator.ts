import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { CameraClaimBody, CameraRegisterBody } from "./Camera.types.js";

// tb_camera_device.name is VARCHAR(60).
export const DEVICE_NAME_MAX_LENGTH = 60;
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Device tokens are 32 random bytes as base64url (43 chars); the range leaves room to change that. */
const DEVICE_TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
const PAIRING_CODE_RE = /^\d{6}$/;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g;
const WHITESPACE_RE = /\s/g;

/** Names are shown on dashboards and on the phone: control characters are removed before trimming. */
const stripControlChars = (value: unknown): unknown =>
  typeof value === "string" ? value.replace(CONTROL_CHARS_RE, "") : value;

export const isCameraDeviceId = (value: unknown): value is string =>
  typeof value === "string" && DEVICE_ID_RE.test(value);

export const isWellFormedDeviceToken = (value: unknown): value is string =>
  typeof value === "string" && DEVICE_TOKEN_RE.test(value);

export function validateRegisterBody(body: Record<string, unknown>, event?: IRequestLogEvent): CameraRegisterBody {
  const name = V.requiredText(stripControlChars(body.name), "name", DEVICE_NAME_MAX_LENGTH, event);
  const out: CameraRegisterBody = { name };
  // Credentials are optional and all-or-nothing; malformed ones are treated as absent
  // so a phone with corrupt storage just registers as a new device.
  if (isCameraDeviceId(body.deviceId) && isWellFormedDeviceToken(body.token)) {
    out.deviceId = body.deviceId;
    out.token = body.token;
  }
  event?.children?.push(`(O) 'deviceId' + 'token' ${out.token ? LogEmoji.success : LogEmoji.warning} `);
  return out;
}

export function validateClaimBody(body: Record<string, unknown>, event?: IRequestLogEvent): CameraClaimBody {
  // The phone shows the code as "123 456"; spaces are allowed.
  const code = typeof body.code === "string" ? body.code.replace(WHITESPACE_RE, "") : "";
  const isValid = PAIRING_CODE_RE.test(code);
  event?.children?.push(`(M) 'code' 6 digits ${isValid ? LogEmoji.success : LogEmoji.error} `);
  if (!isValid) throw new Exceptions.InvalidRequest("code", "format");
  const name = V.optionalText(stripControlChars(body.name), "name", DEVICE_NAME_MAX_LENGTH, event);
  return name ? { code, name } : { code };
}

export function validateDeviceIdParam(value: unknown): string {
  if (!isCameraDeviceId(value)) throw new Exceptions.InvalidRequest("deviceId", "format");
  return value;
}
