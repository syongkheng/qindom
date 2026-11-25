import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";

const OTP_REGEX = /^\d{6}$/;

// Systems new accounts may be created under. Login/verify don't check this so
// rows created before the allowlist existed keep working.
const REGISTER_SYSTEMS = ["fnd"];

// tb_aa_user.username is VARCHAR(64).
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 64;

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

export class AuthValidator {
  static validatePreflightRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { email: string; system: string } {
    const { email, system } = body;
    V.requiredEmail(email, "email", loggingEvent);
    V.requiredString(system, "system", loggingEvent);
    return { email: (email as string).toLowerCase().trim(), system: system as string };
  }

  static validateLoginRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { email: string; password: string; system: string } {
    const { email, password, system } = body;
    V.requiredEmail(email, "email", loggingEvent);
    V.requiredString(password, "password", loggingEvent);
    V.requiredString(system, "system", loggingEvent);
    return { email: (email as string).toLowerCase().trim(), password: password as string, system: system as string };
  }

  static validateRegisterRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { username: string; email: string; password: string; system: string } {
    const { username, email, password, system } = body;
    validateUsername(username, "username", loggingEvent);
    V.requiredEmail(email, "email", loggingEvent);
    V.requiredString(password, "password", loggingEvent);
    if (!this._isStrongPassword(password as string)) {
      loggingEvent?.children?.push(`'password' strength ${LogEmoji.error} `);
      throw new Exceptions.WeakPassword();
    }
    loggingEvent?.children?.push(`'password' strength ${LogEmoji.success} `);
    V.requiredString(system, "system", loggingEvent);
    if (!REGISTER_SYSTEMS.includes(system as string)) {
      loggingEvent?.children?.push(`'system' allowlist ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("system", "format");
    }
    loggingEvent?.children?.push(`'system' allowlist ${LogEmoji.success} `);
    return {
      username: (username as string).trim(),
      email: (email as string).toLowerCase().trim(),
      password: password as string,
      system: system as string,
    };
  }

  static validateEmailVerifyRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { email: string; system: string; code: string; password: string } {
    const { email, system, code, password } = body;
    V.requiredEmail(email, "email", loggingEvent);
    V.requiredString(system, "system", loggingEvent);
    V.required(code, "code", loggingEvent);
    V.regex(code, OTP_REGEX, "code", loggingEvent);
    V.requiredString(password, "password", loggingEvent);
    return {
      email: (email as string).toLowerCase().trim(),
      system: system as string,
      code: code as string,
      password: password as string,
    };
  }

  static validatePasswordValidateRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { password: string } {
    const { password } = body;
    V.requiredString(password, "password", loggingEvent);
    return { password: password as string };
  }

  static validatePasswordUpdateRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { currentPassword: string; newPassword: string } {
    const { currentPassword, newPassword } = body;
    V.requiredString(currentPassword, "currentPassword", loggingEvent);
    V.requiredString(newPassword, "newPassword", loggingEvent);
    if (!this._isStrongPassword(newPassword as string)) {
      loggingEvent?.children?.push(`'newPassword' strength ${LogEmoji.error} `);
      throw new Exceptions.WeakPassword();
    }
    loggingEvent?.children?.push(`'newPassword' strength ${LogEmoji.success} `);
    return { currentPassword: currentPassword as string, newPassword: newPassword as string };
  }

  private static _isStrongPassword(password: string): boolean {
    return (
      password.length >= 8 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    );
  }
}
