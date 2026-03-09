import crypto from "crypto";
import { ITB_AA_USER } from "../models/databases/tb_aa_user";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";
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
  }: {
    email: string;
    system: string;
  }): Promise<{ exist: boolean; nextStep: "register" | "login" }> {
    LoggingUtilities.service.debug(
      "AuthService.checkIfEmailExistsWithinSystem",
      `Finding email: ${email} in system: ${system}`,
    );
    const existing = await this.db.find<ITB_AA_USER>("tb_aa_user", { email, system, record_status: "A" }, { limit: 1 });

    if (existing.length > 0) {
      return { exist: true, nextStep: "login" };
    }
    return { exist: false, nextStep: "register" };
  }

  async createNewUser({
    username,
    email,
    password,
    system,
  }: {
    username: string;
    email: string;
    password: string;
    system: string;
  }): Promise<{ requiresVerification: true; email: string }> {
    LoggingUtilities.service.info(
      "AuthService.createNewUser",
      `Creating user: ${username} (${email}) for system: ${system}`,
    );

    // Reject if email already registered in this system
    const existing = await this.db.find<ITB_AA_USER>("tb_aa_user", { email, system, record_status: "A" }, { limit: 1 });
    if (existing.length > 0) {
      throw new Exceptions.RegistrationException();
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const code = generateSixDigitCode();
    const codeHash = hashCode(code);
    const expiresAt = Date.now() + VERIFY_CODE_TTL_MS;

    try {
      await this.db.insert<ITB_AA_USER>("tb_aa_user", {
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
      });

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

      LoggingUtilities.service.info("AuthService.createNewUser", `Verification code sent to ${email}`);

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
  }: {
    email: string;
    system: string;
    code: string;
  }): Promise<{ token: string }> {
    LoggingUtilities.service.info("AuthService.verifyEmail", `Verifying code for ${email}_${system}`);

    const user = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      email,
      system,
      record_status: "A",
    });

    if (!user) {
      throw new Exceptions.InvalidLoginCredentials();
    }

    if (user.email_verified === 1) {
      // Already verified — just issue a token (resent-code edge case)
      return this._issueToken(user);
    }

    // Brute-force guard
    if ((user.verify_attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
      LoggingUtilities.service.warn("AuthService.verifyEmail", `Max attempts exceeded for ${email}`);
      throw new Exceptions.InvalidLoginCredentials();
    }

    // Expiry check
    if (!user.verify_code_expires_at || Date.now() > user.verify_code_expires_at) {
      throw new Exceptions.InvalidLoginCredentials();
    }

    const incoming = hashCode(code);
    if (incoming !== user.verify_code) {
      // Increment attempt counter
      await this.db.update<ITB_AA_USER>(
        "tb_aa_user",
        { email, system, record_status: "A" },
        { verify_attempts: (user.verify_attempts ?? 0) + 1 },
      );
      throw new Exceptions.InvalidLoginCredentials();
    }

    // Success — mark verified and clear OTP fields
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
    );

    LoggingUtilities.service.info("AuthService.verifyEmail", `Email verified for ${email}`);
    return this._issueToken(user);
  }

  async resendVerifyCode({ email, system }: { email: string; system: string }): Promise<void> {
    const user = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      email,
      system,
      record_status: "A",
    });

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
  }: {
    email: string;
    password: string;
    system: string;
  }): Promise<{ token: string }> {
    LoggingUtilities.service.info("AuthService.login", `Login attempt for ${email}_${system}`);

    const user = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      email,
      system,
      record_status: "A",
    });

    if (!user) {
      throw new Exceptions.InvalidLoginCredentials();
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Exceptions.InvalidLoginCredentials();
    }

    if (user.email_verified !== 1) {
      LoggingUtilities.service.warn("AuthService.login", `Unverified login attempt for ${email}`);
      throw new Exceptions.EmailNotVerified();
    }

    return this._issueToken(user);
  }

  private async _issueToken(user: ITB_AA_USER): Promise<{ token: string }> {
    let parsedRoles: string[] = [];
    try {
      const parsed = JSON.parse(user.roles ?? "[]");
      parsedRoles = Array.isArray(parsed) ? parsed : [];
    } catch {
      parsedRoles = [];
    }

    const generatedToken = await this.tokenService.generateToken({
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
    );

    LoggingUtilities.service.info("AuthService.login", `Token issued for ${user.email} as ${user.username}`);
    return { token: generatedToken };
  }

  async authenticateToken(token: string): Promise<{ username: string; roles: string[]; exist: boolean }> {
    const decodedToken = await this.tokenService.decodeToken(token);
    const existing = await this.db.find<ITB_AA_USER>(
      "tb_aa_user",
      { username: decodedToken.username, system: decodedToken.system, record_status: "A" },
      { limit: 1 },
    );
    return { username: decodedToken.username, roles: decodedToken.roles ?? [], exist: existing.length > 0 };
  }

  async validatePassword(username_system: string, password: string): Promise<{ isValid: boolean }> {
    const user = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      username_system,
      record_status: "A",
    });

    if (!user) throw new Exceptions.InvalidLoginCredentials();

    const isValid = await bcrypt.compare(password, user.password);
    return { isValid };
  }

  async updatePassword(username_system: string, newPassword: string): Promise<void> {
    const user = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      username_system,
      record_status: "A",
    });

    const saltRounds = 10;
    try {
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      await this.db.update<ITB_AA_USER>(
        "tb_aa_user",
        { username_system, record_status: "A" },
        { password: hashedPassword },
      );
    } catch (error) {
      throw new Exceptions.EntityUpdate("Password");
    }

    // Send security notification (best-effort — do not throw if mail fails)
    if (user?.email) {
      const changedAt = new Date().toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
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
        LoggingUtilities.service.warn("AuthService.updatePassword", `Failed to send password-change notification to ${user.email}`);
      });
    }
  }
}
