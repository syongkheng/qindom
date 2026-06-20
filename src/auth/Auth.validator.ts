import { WeakPasswordException } from "../exceptions/WeakPasswordException.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;

export class AuthValidator {
  static validatePreflightRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { email: string; system: string } {
    const { email, system } = body;
    StructuralValidationUtilities.required(email, "email", event);
    StructuralValidationUtilities.string(email, "email", event);
    if (!EMAIL_REGEX.test(email as string)) {
      event?.children?.push(`'email' format ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'email' must be a valid email address");
    }
    event?.children?.push(`'email' format ${LogEmoji.success} `);
    StructuralValidationUtilities.required(system, "system", event);
    StructuralValidationUtilities.string(system, "system", event);
    return { email: (email as string).toLowerCase().trim(), system: system as string };
  }

  static validateLoginRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { email: string; password: string; system: string } {
    const { email, password, system } = body;
    StructuralValidationUtilities.required(email, "email", event);
    StructuralValidationUtilities.string(email, "email", event);
    if (!EMAIL_REGEX.test(email as string)) {
      event?.children?.push(`'email' format ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'email' must be a valid email address");
    }
    event?.children?.push(`'email' format ${LogEmoji.success} `);
    StructuralValidationUtilities.required(password, "password", event);
    StructuralValidationUtilities.string(password, "password", event);
    StructuralValidationUtilities.required(system, "system", event);
    StructuralValidationUtilities.string(system, "system", event);
    return { email: (email as string).toLowerCase().trim(), password: password as string, system: system as string };
  }

  static validateRegisterRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { username: string; email: string; password: string; system: string } {
    const { username, email, password, system } = body;
    StructuralValidationUtilities.required(username, "username", event);
    StructuralValidationUtilities.string(username, "username", event);
    if ((username as string).trim().length < 3) {
      event?.children?.push(`'username' minLength ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'username' must be at least 3 characters");
    }
    event?.children?.push(`'username' minLength ${LogEmoji.success} `);
    StructuralValidationUtilities.required(email, "email", event);
    StructuralValidationUtilities.string(email, "email", event);
    if (!EMAIL_REGEX.test(email as string)) {
      event?.children?.push(`'email' format ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'email' must be a valid email address");
    }
    event?.children?.push(`'email' format ${LogEmoji.success} `);
    StructuralValidationUtilities.required(password, "password", event);
    StructuralValidationUtilities.string(password, "password", event);
    if (!this._isStrongPassword(password as string)) {
      event?.children?.push(`'password' strength ${LogEmoji.error} `);
      throw new WeakPasswordException();
    }
    event?.children?.push(`'password' strength ${LogEmoji.success} `);
    StructuralValidationUtilities.required(system, "system", event);
    StructuralValidationUtilities.string(system, "system", event);
    return {
      username: (username as string).trim(),
      email: (email as string).toLowerCase().trim(),
      password: password as string,
      system: system as string,
    };
  }

  static validateEmailVerifyRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { email: string; system: string; code: string } {
    const { email, system, code } = body;
    StructuralValidationUtilities.required(email, "email", event);
    StructuralValidationUtilities.string(email, "email", event);
    if (!EMAIL_REGEX.test(email as string)) {
      event?.children?.push(`'email' format ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'email' must be a valid email address");
    }
    event?.children?.push(`'email' format ${LogEmoji.success} `);
    StructuralValidationUtilities.required(system, "system", event);
    StructuralValidationUtilities.string(system, "system", event);
    StructuralValidationUtilities.required(code, "code", event);
    StructuralValidationUtilities.string(code, "code", event);
    if (!OTP_REGEX.test(code as string)) {
      event?.children?.push(`'code' format ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'code' must be a 6-digit number");
    }
    event?.children?.push(`'code' format ${LogEmoji.success} `);
    return { email: (email as string).toLowerCase().trim(), system: system as string, code: code as string };
  }

  static validateValidateTokenRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { token: string } {
    const { token } = body;
    StructuralValidationUtilities.required(token, "token", event);
    StructuralValidationUtilities.string(token, "token", event);
    return { token: token as string };
  }

  static validatePasswordValidateRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { password: string } {
    const { password } = body;
    StructuralValidationUtilities.required(password, "password", event);
    StructuralValidationUtilities.string(password, "password", event);
    return { password: password as string };
  }

  static validatePasswordUpdateRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { newPassword: string } {
    const { newPassword } = body;
    StructuralValidationUtilities.required(newPassword, "newPassword", event);
    StructuralValidationUtilities.string(newPassword, "newPassword", event);
    if (!this._isStrongPassword(newPassword as string)) {
      event?.children?.push(`'newPassword' strength ${LogEmoji.error} `);
      throw new WeakPasswordException();
    }
    event?.children?.push(`'newPassword' strength ${LogEmoji.success} `);
    return { newPassword: newPassword as string };
  }

  private static _isStrongPassword(password: string): boolean {
    return (
      password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    );
  }
}
