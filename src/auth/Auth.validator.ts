import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V, charLength } from "../utils/StructuralValidationUtilities.js";
import { TELEGRAM_LOG_MODULE_KEYS } from "../utils/logging/TelegramLogModules.js";
import { isValidRole } from "./Permission.js";
import {
  AuthEmailBody,
  AuthLoginBody,
  AuthPasswordUpdateBody,
  AuthPasswordValidateBody,
  AuthRegisterBody,
  AuthTelegramLogToggleBody,
  AuthUserRolesBody,
  AuthVerifyEmailBody,
} from "./Auth.types.js";

const OTP_REGEX = /^\d{6}$/;

// Systems new accounts may be created under. Login/verify don't check this so
// rows created before the allowlist existed keep working.
const REGISTER_SYSTEMS = ["fnd"];

// tb_aa_user column widths (initial schema): username VARCHAR(64), email VARCHAR(255), `system` VARCHAR(256).
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 64;
export const EMAIL_MAX_LENGTH = 255;
export const SYSTEM_MAX_LENGTH = 256;

// Mirrored client-side by fndom `utilities/PasswordUtils.ts` (isPasswordValid).
const PASSWORD_MIN_LENGTH = 8;
/** bcrypt only hashes the first 72 bytes, so a longer password would match on any shared 72-byte prefix. */
export const PASSWORD_MAX_BYTES = 72;

// Request ids are "req_" + 12 hex (RestRequestLogger); 5 hex = ids already in older log files.
const REQUEST_ID_REGEX = /^req_([0-9a-f]{12}|[0-9a-f]{5})$/i;

const RECENT_LOGS_DEFAULT_LIMIT = 3;
const RECENT_LOGS_MIN_LIMIT = 1;
const RECENT_LOGS_MAX_LIMIT = 20;

/** Shared by register and profile username change. Returns the trimmed username. */
export function validateUsername(value: unknown, fieldName: string, event?: IRequestLogEvent): string {
  const username = V.requiredText(value, fieldName, USERNAME_MAX_LENGTH, event);
  const isLongEnough = charLength(username) >= USERNAME_MIN_LENGTH;
  event?.children?.push(
    `'${fieldName}' ≥${USERNAME_MIN_LENGTH} chars ${isLongEnough ? LogEmoji.success : LogEmoji.error} `,
  );
  if (!isLongEnough) throw new Exceptions.InvalidRequest(fieldName, "format");
  return username;
}

/** ≥ 8 chars with a lowercase letter, an uppercase letter, a digit and a symbol. */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function fitsBcrypt(password: string, fieldName: string, event?: IRequestLogEvent): boolean {
  const fits = Buffer.byteLength(password, "utf8") <= PASSWORD_MAX_BYTES;
  event?.children?.push(`'${fieldName}' ≤${PASSWORD_MAX_BYTES} bytes ${fits ? LogEmoji.success : LogEmoji.error} `);
  return fits;
}

/** An existing password (login, verify, re-check), kept as sent. Over 72 bytes → 400 `invalid_request_<field>`. */
function validatePassword(value: unknown, fieldName: string, event?: IRequestLogEvent): string {
  V.requiredString(value, fieldName, event);
  const password = value as string;
  if (!fitsBcrypt(password, fieldName, event)) throw new Exceptions.InvalidRequest(fieldName, "format");
  return password;
}

/** A password being set (register, update), kept as sent. Over 72 bytes or not strong → 400 `weak_password`. */
function validateNewPassword(value: unknown, fieldName: string, event?: IRequestLogEvent): string {
  V.requiredString(value, fieldName, event);
  const password = value as string;
  const isStrong = fitsBcrypt(password, fieldName, event) && isStrongPassword(password);
  event?.children?.push(`'${fieldName}' strength ${isStrong ? LogEmoji.success : LogEmoji.error} `);
  if (!isStrong) throw new Exceptions.WeakPassword();
  return password;
}

/** Checked as sent (a padded address fails the format check), capped at the column, then lowercased + trimmed. */
function validateEmail(value: unknown, event?: IRequestLogEvent): string {
  V.requiredEmail(value, "email", event);
  return V.requiredText(value, "email", EMAIL_MAX_LENGTH, event).toLowerCase();
}

function validateSystem(value: unknown, event?: IRequestLogEvent): string {
  return V.requiredText(value, "system", SYSTEM_MAX_LENGTH, event);
}

// ── Public auth bodies ─────────────────────────────────────────

/** `/preflight` and `/resend-verify`. */
export function validateEmailBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthEmailBody {
  const email = validateEmail(body.email, event);
  return { email, system: validateSystem(body.system, event) };
}

export function validateLoginBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthLoginBody {
  const email = validateEmail(body.email, event);
  const password = validatePassword(body.password, "password", event);
  return { email, password, system: validateSystem(body.system, event) };
}

export function validateRegisterBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthRegisterBody {
  const username = validateUsername(body.username, "username", event);
  const email = validateEmail(body.email, event);
  const password = validateNewPassword(body.password, "password", event);
  const system = validateSystem(body.system, event);
  const isAllowedSystem = REGISTER_SYSTEMS.includes(system);
  event?.children?.push(`'system' allowlist ${isAllowedSystem ? LogEmoji.success : LogEmoji.error} `);
  if (!isAllowedSystem) throw new Exceptions.InvalidRequest("system", "format");
  return { username, email, password, system };
}

export function validateVerifyEmailBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthVerifyEmailBody {
  const email = validateEmail(body.email, event);
  const system = validateSystem(body.system, event);
  V.required(body.code, "code", event);
  V.regex(body.code, OTP_REGEX, "code", event);
  const password = validatePassword(body.password, "password", event);
  return { email, system, code: body.code as string, password };
}

export function validatePasswordValidateBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): AuthPasswordValidateBody {
  return { password: validatePassword(body.password, "password", event) };
}

export function validatePasswordUpdateBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): AuthPasswordUpdateBody {
  const currentPassword = validatePassword(body.currentPassword, "currentPassword", event);
  const newPassword = validateNewPassword(body.newPassword, "newPassword", event);
  return { currentPassword, newPassword };
}

// ── Admin params and bodies ────────────────────────────────────

function positiveIntParam(raw: string, fieldName: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Exceptions.InvalidRequest(fieldName, "format");
  return value;
}

export function validateUserIdParam(raw: string): number {
  return positiveIntParam(raw, "id");
}

export function validateTelegramChatIdParam(raw: string): number {
  return positiveIntParam(raw, "chatId");
}

export function validateTelegramModuleKeyParam(raw: string): string {
  if (!TELEGRAM_LOG_MODULE_KEYS.some((m) => m.key === raw)) throw new Exceptions.InvalidRequest("moduleKey", "format");
  return raw;
}

export function validateUserRolesBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthUserRolesBody {
  const { roles } = body;
  const isValid = Array.isArray(roles) && roles.every(isValidRole);
  event?.children?.push(`'roles' role format ${isValid ? LogEmoji.success : LogEmoji.error} `);
  if (!isValid) throw new Exceptions.InvalidRequest("roles", "format");
  return { roles: roles as string[] };
}

export function validateTelegramLogToggleBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): AuthTelegramLogToggleBody {
  V.requiredBoolean(body.enabled, "enabled", event);
  return { enabled: body.enabled as boolean };
}

export function validateRequestIdParam(raw: string): string {
  if (!REQUEST_ID_REGEX.test(raw)) throw new Exceptions.InvalidRequest("requestId", "format");
  return raw;
}

/** Lenient: anything unparseable falls back to the default; numbers are clamped to 1..20. */
export function parseRecentLogsLimit(raw: unknown): number {
  return Math.min(Math.max(Number(raw) || RECENT_LOGS_DEFAULT_LIMIT, RECENT_LOGS_MIN_LIMIT), RECENT_LOGS_MAX_LIMIT);
}
