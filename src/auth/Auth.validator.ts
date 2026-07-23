import { WeakPasswordException } from "../exceptions/WeakPasswordException.js";
import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";

const OTP_REGEX = /^\d{6}$/;

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
    V.requiredString(username, "username", loggingEvent);
    if ((username as string).trim().length < 3) {
      loggingEvent?.children?.push(`'username' minLength ${LogEmoji.error} `);
      throw new InvalidRequestException("username", "format");
    }
    loggingEvent?.children?.push(`'username' minLength ${LogEmoji.success} `);
    V.requiredEmail(email, "email", loggingEvent);
    V.requiredString(password, "password", loggingEvent);
    if (!this._isStrongPassword(password as string)) {
      loggingEvent?.children?.push(`'password' strength ${LogEmoji.error} `);
      throw new WeakPasswordException();
    }
    loggingEvent?.children?.push(`'password' strength ${LogEmoji.success} `);
    V.requiredString(system, "system", loggingEvent);
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
  ): { email: string; system: string; code: string } {
    const { email, system, code } = body;
    V.requiredEmail(email, "email", loggingEvent);
    V.requiredString(system, "system", loggingEvent);
    V.required(code, "code", loggingEvent);
    V.regex(code, OTP_REGEX, "code", loggingEvent);
    return { email: (email as string).toLowerCase().trim(), system: system as string, code: code as string };
  }

  static validateValidateTokenRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { token: string } {
    const { token } = body;
    V.requiredString(token, "token", loggingEvent);
    return { token: token as string };
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
  ): { newPassword: string } {
    const { newPassword } = body;
    V.requiredString(newPassword, "newPassword", loggingEvent);
    if (!this._isStrongPassword(newPassword as string)) {
      loggingEvent?.children?.push(`'newPassword' strength ${LogEmoji.error} `);
      throw new WeakPasswordException();
    }
    loggingEvent?.children?.push(`'newPassword' strength ${LogEmoji.success} `);
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
