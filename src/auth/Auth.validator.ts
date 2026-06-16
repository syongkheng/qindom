import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import { WeakPasswordException } from "../exceptions/WeakPasswordException.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthValidator {
  static validatePreflightRequest = (req: Request): { email: string; system: string } => {
    const { email, system } = req.body;
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      throw new InvalidRequestException("email");
    }
    if (!system || typeof system !== "string") {
      throw new InvalidRequestException("system");
    }
    return { email: email.toLowerCase().trim(), system };
  };

  static validateLoginRequest = (req: Request): { email: string; password: string; system: string } => {
    const { email, password, system } = req.body;
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      throw new InvalidRequestException("email");
    }
    if (!password || typeof password !== "string") {
      throw new InvalidRequestException("password");
    }
    if (!system || typeof system !== "string") {
      throw new InvalidRequestException("system");
    }
    return { email: email.toLowerCase().trim(), password, system };
  };

  static validateRegisterRequest = (
    req: Request
  ): { username: string; email: string; password: string; system: string } => {
    const { username, email, password, system } = req.body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      throw new InvalidRequestException("username");
    }
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      throw new InvalidRequestException("email");
    }
    if (!password || typeof password !== "string") {
      throw new InvalidRequestException("password");
    }
    if (this._validatePasswordStrength(password).valid === false) {
      throw new WeakPasswordException();
    }
    if (!system || typeof system !== "string") {
      throw new InvalidRequestException("system");
    }
    return { username: username.trim(), email: email.toLowerCase().trim(), password, system };
  };

  static validateEmailVerifyRequest = (req: Request): { email: string; system: string; code: string } => {
    const { email, system, code } = req.body;
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      throw new InvalidRequestException("email");
    }
    if (!system || typeof system !== "string") {
      throw new InvalidRequestException("system");
    }
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      throw new InvalidRequestException("code");
    }
    return { email: email.toLowerCase().trim(), system, code };
  };

  static validateValidateTokenRequest = (req: Request): { token: string } => {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      throw new InvalidRequestException("token");
    }
    return { token };
  };

  static validatePasswordValidateRequest = (req: Request): { password: string } => {
    const { password } = req.body;
    if (!password || typeof password !== "string") {
      throw new InvalidRequestException("password");
    }
    return { password };
  };

  static validatePasswordUpdateRequest = (req: Request): { newPassword: string } => {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string") {
      throw new InvalidRequestException("newPassword");
    }
    if (this._validatePasswordStrength(newPassword).valid === false) {
      throw new WeakPasswordException();
    }
    return { newPassword };
  };

  private static _validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 12) {
      errors.push("Password must be at least 12 characters long");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain a lowercase letter");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain an uppercase letter");
    }
    if (!/\d/.test(password)) {
      errors.push("Password must contain a number");
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push("Password must contain a special character");
    }

    if (errors.length > 0) {
      LoggingUtilities.service.error(
        "validatePasswordStrength",
        `Password validation failed with errors: ${errors.join("--")}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
