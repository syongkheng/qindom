import { Exceptions } from "../exceptions/AppExceptions.js";
import { CameraClaimBody, CameraRegisterBody } from "../models/requests/CameraBody.js";

export const CAMERA_MAX_NAME = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
const CODE_RE = /^\d{6}$/;

function cleanName(value: unknown, field: string, required: boolean): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Exceptions.InvalidRequest(field, "mandatory");
    return undefined;
  }
  if (typeof value !== "string") throw new Exceptions.InvalidRequest(field, "format");
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!trimmed || trimmed.length > CAMERA_MAX_NAME) throw new Exceptions.InvalidRequest(field, "format");
  return trimmed;
}

export const isCameraDeviceId = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

export class CameraValidator {
  static validateRegister(body: Record<string, unknown>): CameraRegisterBody {
    const name = cleanName(body.name, "name", true)!;
    const out: CameraRegisterBody = { name };
    // Credentials are optional and all-or-nothing; malformed ones are treated as absent
    // so a phone with corrupt storage just registers as a new device.
    if (isCameraDeviceId(body.deviceId) && typeof body.token === "string" && TOKEN_RE.test(body.token)) {
      out.deviceId = body.deviceId;
      out.token = body.token;
    }
    return out;
  }

  static validateClaim(body: Record<string, unknown>): CameraClaimBody {
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    if (!CODE_RE.test(code)) throw new Exceptions.InvalidRequest("code", "format");
    return { code, name: cleanName(body.name, "name", false) };
  }

  static validateDeviceId(value: unknown): string {
    if (!isCameraDeviceId(value)) throw new Exceptions.InvalidRequest("deviceId", "format");
    return value;
  }

  static isWellFormedToken(value: string): boolean {
    return TOKEN_RE.test(value);
  }
}
