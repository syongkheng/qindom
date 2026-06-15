import crypto from "crypto";
import { ITB_AA_USER } from "../models/databases/tb_aa_user";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext";
import bcrypt from "bcrypt";
import { TokenService } from "../token/Token.service";
import { Exceptions } from "../exceptions/AppExceptions";
import { MailerUtilities } from "../utils/MailerUtilities";

const VERIFY_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_VERIFY_ATTEMPTS = 5;

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateSixDigitCode(): string {
  // Cryptographically random 6-digit code
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, "0");
}

export class AuthService {
  private tokenService: TokenService;
  constructor(private db: KnexSqlUtilities) {
    this.tokenService = new TokenService(db);
  }

  async checkIfEmailExistsWithinSystem({
    email,
    system,
    logContext,
  }: {
    email: string;
    system: string;
    logContext?: IRequestLogContext;
  }): Promise<{ exist: boolean; nextStep: "register" | "login" }> {
    const authEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "AUTH", "Checking account existence")
      : undefined;

    const existing = await this.db.find<ITB_AA_USER>(
      "tb_aa_user",
      { email, system, record_status: "A" },
      { limit: 1 },
      authEvent,
    );

    const found = existing.length > 0;
    if (authEvent) authEvent.detail = found ? "email found" : "email not found";

    return found ? { exist: true, nextStep: "login" } : { exist: false, nextStep: "register" };
  }

  async createNewUser({
    username,
    email,
    password,
    system,
    logContext,
  }: {
    username: string;
    email: string;
    password: string;
    system: string;
    logContext?: IRequestLogContext;
  }): Promise<{ requiresVerification: true; email: string }> {
    const authEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "AUTH", "Registering new user")
      : undefined;

    const existing = await this.db.find<ITB_AA_USER>(
      "tb_aa_user",
      { email, system, record_status: "A" },
      { limit: 1 },
      authEvent,
    );
    if (existing.length > 0) {
      if (authEvent) authEvent.detail = "email already registered";
      throw new Exceptions.EmailAlreadyRegistered();
    }

    const existingUsername = await this.db.find<ITB_AA_USER>(
      "tb_aa_user",
      { username_system: `${username}_${system}`, record_status: "A" },
      { limit: 1 },
      authEvent,
    );
    if (existingUsername.length > 0) {
      if (authEvent) authEvent.detail = "username already taken";
      throw new Exceptions.UsernameAlreadyTaken();
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const code = generateSixDigitCode();
    const codeHash = hashCode(code);
    const expiresAt = Date.now() + VERIFY_CODE_TTL_MS;

    try {
      await this.db.insert<ITB_AA_USER>(
        "tb_aa_user",
        {
          username,
          email,
          email_verified: 0,
          verify_code: codeHash,
          verify_code_expires_at: expiresAt,
          verify_attempts: 0,
          password: hashedPassword,
          system,
          roles: "[]",
          username_system: `${username}_${system}`,
          state: "REGISTER",
          created_dt: Date.now(),
          created_by: "SYSTEM",
          record_status: "A",
        },
        authEvent,
      );

      await MailerUtilities.sendMail({
        to: email,
        subject: `${code} is your verification code`,
        html: `
          <p>Hi <strong>${username}</strong>,</p>
          <p>Your verification code is:</p>
          <h2 style="letter-spacing:0.2em;">${code}</h2>
          <p>This code expires in <strong>15 minutes</strong>. Do not share it with anyone.</p>
          <p>— no-reply-awense</p>
        `,
      });

      if (authEvent) authEvent.detail = "user created, verification email sent";

      return { requiresVerification: true, email };
    } catch (error) {
      LoggingUtilities.service.error("AuthService.createNewUser", `Registration failed for ${email}: ${error}`);
      throw new Exceptions.RegistrationException();
    }
  }

  async verifyEmail({
    email,
    system,
    code,
    logContext,
  }: {
    email: string;
    system: string;
    code: string;
    logContext?: IRequestLogContext;
  }): Promise<{ token: string; username: string; roles: string[] }> {
    const authEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "AUTH", "Verifying email OTP")
      : undefined;

    const user = await this.db.findOne<ITB_AA_USER>(
      "tb_aa_user",
      { email, system, record_status: "A" },
      ["*"],
      authEvent,
    );

    if (!user) {
      if (authEvent) authEvent.detail = "user not found";
      throw new Exceptions.InvalidLoginCredentials();
    }

    if (user.email_verified === 1) {
      if (authEvent) authEvent.detail = "already verified, issuing token";
      return this._issueToken(user, authEvent);
    }

    if ((user.verify_attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
      if (authEvent) authEvent.detail = "max attempts exceeded";
      LoggingUtilities.service.warn("AuthService.verifyEmail", `Max attempts exceeded for ${email}`);
      throw new Exceptions.MaxVerifyAttempts();
    }

    if (!user.verify_code_expires_at || Date.now() > user.verify_code_expires_at) {
      if (authEvent) authEvent.detail = "OTP expired";
      throw new Exceptions.VerifyCodeExpired();
    }

    const incoming = hashCode(code);
    if (incoming !== user.verify_code) {
      await this.db.update<ITB_AA_USER>(
        "tb_aa_user",
        { email, system, record_status: "A" },
        { verify_attempts: (user.verify_attempts ?? 0) + 1 },
        authEvent,
      );
      if (authEvent) authEvent.detail = "invalid OTP";
      throw new Exceptions.InvalidLoginCredentials();
    }

    await this.db.update<ITB_AA_USER>(
      "tb_aa_user",
      { email, system, record_status: "A" },
      {
        email_verified: 1,
        verify_code: null,
        verify_code_expires_at: null,
        verify_attempts: 0,
        state: "ACTIVE",
      },
      authEvent,
    );

    if (authEvent) authEvent.detail = "email verified";
    return this._issueToken(user, authEvent);
  }

  async resendVerifyCode({
    email,
    system,
    logContext,
  }: {
    email: string;
    system: string;
    logContext?: IRequestLogContext;
  }): Promise<void> {
    const resendEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "AUTH", "Resending verification code")
      : undefined;

    const user = await this.db.findOne<ITB_AA_USER>(
      "tb_aa_user",
      { email, system, record_status: "A" },
      ["*"],
      resendEvent,
    );

    if (!user || user.email_verified === 1) return; // silently ignore

    const code = generateSixDigitCode();
    const codeHash = hashCode(code);
    const expiresAt = Date.now() + VERIFY_CODE_TTL_MS;

    await this.db.update<ITB_AA_USER>(
      "tb_aa_user",
      { email, system, record_status: "A" },
      {
        verify_code: codeHash,
        verify_code_expires_at: expiresAt,
        verify_attempts: 0,
      },
      resendEvent,
    );

    await MailerUtilities.sendMail({
      to: email,
      subject: `${code} is your verification code`,
      html: `
          <p>Hi <strong>${user.username}</strong>,</p>
          <p>Your verification code is:</p>
          <h2 style="letter-spacing:0.2em;">${code}</h2>
          <p>This code expires in <strong>15 minutes</strong>. Do not share it with anyone.</p>
          <p>— no-reply-awense</p>
        `,
    });
  }

  async login({
    email,
    password,
    system,
    logContext,
  }: {
    email: string;
    password: string;
    system: string;
    logContext?: IRequestLogContext;
  }): Promise<{ token: string; username: string; roles: string[] }> {
    const authEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "AUTH", "Authenticating user")
      : undefined;

    const user = await this.db.findOne<ITB_AA_USER>(
      "tb_aa_user",
      { email, system, record_status: "A" },
      ["*"],
      authEvent,
    );

    if (!user) {
      if (authEvent) authEvent.detail = "user not found";
      throw new Exceptions.InvalidLoginCredentials();
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      if (authEvent) authEvent.detail = "invalid password";
      throw new Exceptions.InvalidLoginCredentials();
    }

    if (user.email_verified !== 1) {
      if (authEvent) authEvent.detail = "email not verified";
      LoggingUtilities.service.warn("AuthService.login", `Unverified login attempt for ${email}`);
      throw new Exceptions.EmailNotVerified();
    }

    if (authEvent) authEvent.detail = "authenticated";
    return this._issueToken(user, authEvent);
  }

  private async _issueToken(
    user: ITB_AA_USER,
    authEvent?: IRequestLogEvent,
  ): Promise<{ token: string; username: string; roles: string[] }> {
    let parsedRoles: string[] = [];
    try {
      const parsed = JSON.parse(user.roles ?? "[]");
      parsedRoles = Array.isArray(parsed) ? parsed : [];
    } catch {
      parsedRoles = [];
    }

    const generatedToken = await this.tokenService.generateToken({
      id: user.id!,
      username: user.username,
      system: user.system,
      roles: parsedRoles,
      lastLoggedInDt: user.last_logged_in_dt,
    });

    await this.db.update<ITB_AA_USER>(
      "tb_aa_user",
      { username_system: user.username_system },
      {
        token: generatedToken,
        last_logged_in_dt: Date.now(),
        state: "ACTIVE",
      },
      authEvent,
    );

    return { token: generatedToken, username: user.username, roles: parsedRoles };
  }

  async authenticateToken(
    token: string,
    authEvent?: IRequestLogEvent,
  ): Promise<{ username: string; roles: string[]; exist: boolean }> {
    const decodedToken = await this.tokenService.decodeToken(token);
    const existing = await this.db.find<ITB_AA_USER>(
      "tb_aa_user",
      { username: decodedToken.username, system: decodedToken.system, record_status: "A" },
      { limit: 1 },
      authEvent,
    );
    return { username: decodedToken.username, roles: decodedToken.roles ?? [], exist: existing.length > 0 };
  }

  async validatePassword(
    username_system: string,
    password: string,
    authEvent?: IRequestLogEvent,
  ): Promise<{ isValid: boolean }> {
    const user = await this.db.findOne<ITB_AA_USER>(
      "tb_aa_user",
      { username_system, record_status: "A" },
      ["*"],
      authEvent,
    );

    if (!user) throw new Exceptions.InvalidLoginCredentials();

    const isValid = await bcrypt.compare(password, user.password);
    return { isValid };
  }

  async listUsers(): Promise<
    {
      id: number;
      username: string;
      email: string | undefined;
      system: string;
      roles: string[];
      state: string;
      lastLoggedInDt: number | null;
      createdDt: number;
    }[]
  > {
    const rows = await this.db.find<ITB_AA_USER>(
      "tb_aa_user",
      { record_status: "A" },
      {
        columns: ["id", "username", "email", "system", "roles", "state", "last_logged_in_dt", "created_dt"],
        orderBy: "created_dt",
        orderDirection: "asc",
      },
    );
    return rows.map((u) => ({
      id: u.id!,
      username: u.username,
      email: u.email,
      system: u.system,
      roles: (() => {
        try {
          return JSON.parse(u.roles || "[]");
        } catch {
          return [];
        }
      })(),
      state: u.state,
      lastLoggedInDt: u.last_logged_in_dt ?? null,
      createdDt: u.created_dt,
    }));
  }

  async updateUserRoles(id: number, roles: string[]): Promise<{ updated: boolean }> {
    await this.db.update<ITB_AA_USER>("tb_aa_user", { id }, { roles: JSON.stringify(roles) });
    return { updated: true };
  }

  async updatePassword(username_system: string, newPassword: string, authEvent?: IRequestLogEvent): Promise<void> {
    const user = await this.db.findOne<ITB_AA_USER>(
      "tb_aa_user",
      { username_system, record_status: "A" },
      ["*"],
      authEvent,
    );

    const saltRounds = 10;
    try {
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      await this.db.update<ITB_AA_USER>(
        "tb_aa_user",
        { username_system, record_status: "A" },
        { password: hashedPassword },
        authEvent,
      );
    } catch (error) {
      throw new Exceptions.EntityUpdate("Password");
    }

    // Send security notification (best-effort — do not throw if mail fails)
    if (user?.email) {
      const changedAt = new Date().toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      MailerUtilities.sendMail({
        to: user.email,
        subject: "Your Awense password has been changed",
        html: `
          <p>Hi <strong>${user.username}</strong>,</p>
          <p>Your password was successfully changed on <strong>${changedAt}</strong>.</p>
          <p>If you did not make this change, please contact us immediately and secure your account.</p>
          <p>— no-reply-awense</p>
        `,
      }).catch(() => {
        LoggingUtilities.service.warn(
          "AuthService.updatePassword",
          `Failed to send password-change notification to ${user.email}`,
        );
      });
    }
  }
}
