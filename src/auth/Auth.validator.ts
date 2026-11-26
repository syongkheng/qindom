import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
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

// tb_aa_user.username is VARCHAR(64).
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 64;

// Mirrored client-side by fndom `utilities/PasswordUtils.ts` (isPasswordValid).
const PASSWORD_MIN_LENGTH = 8;

// Request ids are "req_" + 12 hex (RestRequestLogger); 5 hex = ids already in older log files.
const REQUEST_ID_REGEX = /^req_([0-9a-f]{12}|[0-9a-f]{5})$/i;

const RECENT_LOGS_DEFAULT_LIMIT = 3;
const RECENT_LOGS_MIN_LIMIT = 1;
const RECENT_LOGS_MAX_LIMIT = 20;

/** Shared by register and profile username change. Returns the trimmed username. */
export function validateUsername(value: unknown, fieldName: string, event?: IRequestLogEvent): string {
  V.requiredString(value, fieldName, event);
  const username = (value as string).trim();
  const isValid = username.length >= USERNAME_MIN_LENGTH && username.length <= USERNAME_MAX_LENGTH;
  event?.children?.push(
    `'${fieldName}' length ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} ${isValid ? LogEmoji.success : LogEmoji.error} `,
  );
  if (!isValid) throw new Exceptions.InvalidRequest(fieldName, "format");
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

function requireStrongPassword(value: string, fieldName: string, event?: IRequestLogEvent): void {
  const isStrong = isStrongPassword(value);
  event?.children?.push(`'${fieldName}' strength ${isStrong ? LogEmoji.success : LogEmoji.error} `);
  if (!isStrong) throw new Exceptions.WeakPassword();
}

/** Checked as sent (a padded address fails the format check), then lowercased + trimmed. */
function validateEmail(value: unknown, event?: IRequestLogEvent): string {
  V.requiredEmail(value, "email", event);
  return (value as string).toLowerCase().trim();
}

function requiredString(value: unknown, fieldName: string, event?: IRequestLogEvent): string {
  V.requiredString(value, fieldName, event);
  return value as string;
}

// ── Public auth bodies ─────────────────────────────────────────

/** `/preflight` and `/resend-verify`. */
export function validateEmailBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthEmailBody {
  const email = validateEmail(body.email, event);
  return { email, system: requiredString(body.system, "system", event) };
}

export function validateLoginBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthLoginBody {
  const email = validateEmail(body.email, event);
  const password = requiredString(body.password, "password", event);
  return { email, password, system: requiredString(body.system, "system", event) };
}

export function validateRegisterBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthRegisterBody {
  const username = validateUsername(body.username, "username", event);
  const email = validateEmail(body.email, event);
  const password = requiredString(body.password, "password", event);
  requireStrongPassword(password, "password", event);
  const system = requiredString(body.system, "system", event);
  const isAllowedSystem = REGISTER_SYSTEMS.includes(system);
  event?.children?.push(`'system' allowlist ${isAllowedSystem ? LogEmoji.success : LogEmoji.error} `);
  if (!isAllowedSystem) throw new Exceptions.InvalidRequest("system", "format");
  return { username, email, password, system };
}

export function validateVerifyEmailBody(body: Record<string, unknown>, event?: IRequestLogEvent): AuthVerifyEmailBody {
  const email = validateEmail(body.email, event);
  const system = requiredString(body.system, "system", event);
  V.required(body.code, "code", event);
  V.regex(body.code, OTP_REGEX, "code", event);
  const password = requiredString(body.password, "password", event);
  return { email, system, code: body.code as string, password };
}

export function validatePasswordValidateBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): AuthPasswordValidateBody {
  return { password: requiredString(body.password, "password", event) };
}

export function validatePasswordUpdateBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): AuthPasswordUpdateBody {
  const currentPassword = requiredString(body.currentPassword, "currentPassword", event);
  const newPassword = requiredString(body.newPassword, "newPassword", event);
  requireStrongPassword(newPassword, "newPassword", event);
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
