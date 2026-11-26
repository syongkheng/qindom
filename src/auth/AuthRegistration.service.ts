import crypto from "crypto";
import bcrypt from "bcrypt";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { Time } from "../constants/Time.js";
import { IS_DEV } from "../config/env.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { MailerUtilities } from "../utils/MailerUtilities.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { maskEmail } from "../utils/logging/LogRedaction.js";
import { AA_USER_TABLE, AuthSessionService, BCRYPT_SALT_ROUNDS, SESSION_COLUMNS } from "./AuthSession.service.js";
import { verificationCodeMail } from "./Auth.emailTemplate.js";
import {
  AuthEmailBody,
  AuthIssuedSession,
  AuthPreflightDto,
  AuthRegisterBody,
  AuthRegisteredDto,
  AuthVerifyEmailBody,
  UserState,
} from "./Auth.types.js";

export const OTP_TTL_MINUTES = 15;
export const OTP_TTL_MS = OTP_TTL_MINUTES * Time.MINUTE_MS;
export const MAX_VERIFY_ATTEMPTS = 5;
/** Accepted instead of the stored OTP, only when `NODE_ENV === "dev"` (fndom skips the real send in dev). */
export const DEV_OTP_BYPASS_CODE = "111111";

const OTP_MODULUS = 1_000_000;
const OTP_DIGITS = 6;
const REGISTRATION_CREATED_BY = "SYSTEM";
const NO_ROLES = "[]";

const STALE_CHECK_COLUMNS = ["id", "email_verified", "verify_code_expires_at"];
const VERIFY_COLUMNS = [
  ...SESSION_COLUMNS,
  "password",
  "email_verified",
  "verify_code",
  "verify_code_expires_at",
  "verify_attempts",
];
const RESEND_COLUMNS = ["id", "username", "email_verified"];

/** Cryptographically random 6-digit code, uniform over 000000–999999 (`randomInt` has no modulo bias). */
export function generateOtp(): string {
  return crypto.randomInt(0, OTP_MODULUS).toString().padStart(OTP_DIGITS, "0");
}

/**
 * An unverified row whose OTP has lapsed was never proven to belong to the email's owner, so it is
 * treated as free: preflight routes to register and register releases it instead of blocking the
 * real owner forever.
 */
export function isStaleUnverified(
  user: Pick<ITB_AA_USER, "email_verified" | "verify_code_expires_at">,
  now = Date.now(),
): boolean {
  return user.email_verified !== 1 && (!user.verify_code_expires_at || now > user.verify_code_expires_at);
}

export interface AuthRegistrationOptions {
  /** Accept `DEV_OTP_BYPASS_CODE`. Defaults to `IS_DEV`; injectable for tests. */
  devOtpBypass?: boolean;
  generateCode?: () => string;
}

/** Preflight, registration, email OTP verification and resend for `tb_aa_user`. */
export class AuthRegistrationService {
  private readonly devOtpBypass: boolean;
  private readonly generateCode: () => string;

  constructor(
    private db: KnexSqlUtilities,
    private sessions = new AuthSessionService(db),
    { devOtpBypass = IS_DEV, generateCode = generateOtp }: AuthRegistrationOptions = {},
  ) {
    this.devOtpBypass = devOtpBypass;
    this.generateCode = generateCode;
  }

  async preflight({ email, system }: AuthEmailBody, logContext?: IRequestLogContext): Promise<AuthPreflightDto> {
    const event = LoggingUtilities.request.branch(logContext, "AUTH", "Checking account existence");
    const [existing] = await this.db.find<ITB_AA_USER>(
      AA_USER_TABLE,
      { email, system, record_status: RecordStatus.ACTIVE },
      { limit: 1, columns: STALE_CHECK_COLUMNS },
      event,
    );
    const found = !!existing && !isStaleUnverified(existing);
    if (event) event.detail = found ? "email found" : "email not found";
    return found ? { exist: true, nextStep: "login" } : { exist: false, nextStep: "register" };
  }

  async register(
    { username, email, password, system }: AuthRegisterBody,
    logContext?: IRequestLogContext,
  ): Promise<AuthRegisteredDto> {
    const event = LoggingUtilities.request.branch(logContext, "AUTH", "Registering new user");
    const usernameSystem = `${username}_${system}`;

    const byEmail = await this.db.find<ITB_AA_USER>(
      AA_USER_TABLE,
      { email, system, record_status: RecordStatus.ACTIVE },
      { limit: 1, columns: STALE_CHECK_COLUMNS },
      event,
    );
    if (byEmail.length > 0 && !isStaleUnverified(byEmail[0])) {
      if (event) event.detail = "email already registered";
      throw new Exceptions.EmailAlreadyRegistered();
    }
    const byUsername = await this.db.find<ITB_AA_USER>(
      AA_USER_TABLE,
      { username_system: usernameSystem, record_status: RecordStatus.ACTIVE },
      { limit: 1, columns: STALE_CHECK_COLUMNS },
      event,
    );
    if (byUsername.length > 0 && !isStaleUnverified(byUsername[0])) {
      if (event) event.detail = "username already taken";
      throw new Exceptions.UsernameAlreadyTaken();
    }

    // Soft-delete lapsed unverified rows holding this email or username. That
    // frees the username unique key and discards a squatter's chosen password.
    const staleIds = new Set([...byEmail, ...byUsername].map((u) => u.id!));
    for (const id of staleIds) {
      await this.db.update<ITB_AA_USER>(
        AA_USER_TABLE,
        { id, record_status: RecordStatus.ACTIVE },
        { record_status: RecordStatus.DELETED },
        event,
      );
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const code = this.generateCode();

    // `registration_failed` is an fndom contract (mapped to its own message), so insert/mail
    // failures keep this typed error rather than the generic 500.
    try {
      await this.db.insert<ITB_AA_USER>(
        AA_USER_TABLE,
        {
          username,
          email,
          email_verified: 0,
          verify_code: sha256Hex(code),
          verify_code_expires_at: Date.now() + OTP_TTL_MS,
          verify_attempts: 0,
          password: hashedPassword,
          system,
          roles: NO_ROLES,
          username_system: usernameSystem,
          state: UserState.REGISTER,
          created_dt: Date.now(),
          created_by: REGISTRATION_CREATED_BY,
          record_status: RecordStatus.ACTIVE,
        },
        event,
      );
      await MailerUtilities.sendMail(verificationCodeMail(email, username, code, OTP_TTL_MINUTES));
    } catch (error) {
      if (event) event.detail = "insert or verification email failed";
      LoggingUtilities.service.error(
        "AuthRegistrationService.register",
        `Registration failed for ${maskEmail(email)}: ${toMessage(error)}`,
      );
      throw new Exceptions.Registration();
    }

    if (event) event.detail = "user created, verification email sent";
    return { requiresVerification: true, email };
  }

  /**
   * Checks the OTP and the account password, then issues a session. Wrong passwords and wrong
   * codes share one attempt counter; at `MAX_VERIFY_ATTEMPTS` every try is refused (429).
   */
  async verifyEmail(
    { email, system, code, password }: AuthVerifyEmailBody,
    logContext?: IRequestLogContext,
  ): Promise<AuthIssuedSession> {
    const event = LoggingUtilities.request.branch(logContext, "AUTH", "Verifying email OTP");
    const byEmail = { email, system, record_status: RecordStatus.ACTIVE };
    const user = await this.db.findOne<ITB_AA_USER>(AA_USER_TABLE, byEmail, VERIFY_COLUMNS, event);
    if (!user) {
      if (event) event.detail = "user not found";
      throw new Exceptions.InvalidLoginCredentials();
    }

    // An already-verified account must NOT get a session from this endpoint:
    // the OTP is never checked past this point, so issuing a token here let
    // anyone log in as any verified user by POSTing an arbitrary code.
    // Verified users authenticate via /login with their password instead.
    if (user.email_verified === 1) {
      if (event) event.detail = "already verified, rejecting (use /login)";
      throw new Exceptions.EmailAlreadyRegistered();
    }

    const attempts = user.verify_attempts ?? 0;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      if (event) event.detail = "max attempts exceeded";
      LoggingUtilities.service.warn(
        "AuthRegistrationService.verifyEmail",
        `Max attempts exceeded for ${maskEmail(email)}`,
      );
      throw new Exceptions.MaxVerifyAttempts();
    }

    // The OTP only proves inbox access. Also require the password the row was
    // registered with: otherwise someone who registered the victim's email first
    // (and so chose its password) gets the victim to verify an account they can
    // log in to. Wrong passwords count toward the same attempt cap as wrong OTPs.
    if (!(await bcrypt.compare(password, user.password))) {
      await this.db.update<ITB_AA_USER>(AA_USER_TABLE, byEmail, { verify_attempts: attempts + 1 }, event);
      if (event) event.detail = "invalid password";
      throw new Exceptions.InvalidLoginCredentials();
    }

    // Dev bypass: fndom skips the real OTP send outside prod, so accept the fixed
    // code here instead of the DB-stored one, regardless of expiry state.
    const isDevBypass = this.devOtpBypass && code === DEV_OTP_BYPASS_CODE;
    if (!isDevBypass) {
      if (!user.verify_code_expires_at || Date.now() > user.verify_code_expires_at) {
        if (event) event.detail = "OTP expired";
        throw new Exceptions.VerifyCodeExpired();
      }
      if (sha256Hex(code) !== user.verify_code) {
        await this.db.update<ITB_AA_USER>(AA_USER_TABLE, byEmail, { verify_attempts: attempts + 1 }, event);
        if (event) event.detail = "invalid OTP";
        throw new Exceptions.InvalidLoginCredentials();
      }
    }

    await this.db.update<ITB_AA_USER>(
      AA_USER_TABLE,
      byEmail,
      {
        email_verified: 1,
        verify_code: null,
        verify_code_expires_at: null,
        verify_attempts: 0,
        state: UserState.ACTIVE,
      },
      event,
    );
    if (event) event.detail = isDevBypass ? "email verified (dev OTP bypass)" : "email verified";
    return this.sessions.issueSession(user, event);
  }

  /** Silently does nothing for unknown or already-verified emails (the route always answers 200). */
  async resendVerifyCode({ email, system }: AuthEmailBody, logContext?: IRequestLogContext): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "AUTH", "Resending verification code");
    const byEmail = { email, system, record_status: RecordStatus.ACTIVE };
    const user = await this.db.findOne<ITB_AA_USER>(AA_USER_TABLE, byEmail, RESEND_COLUMNS, event);
    if (!user || user.email_verified === 1) {
      if (event) event.detail = "no unverified account, nothing sent";
      return;
    }

    const code = this.generateCode();
    await this.db.update<ITB_AA_USER>(
      AA_USER_TABLE,
      byEmail,
      { verify_code: sha256Hex(code), verify_code_expires_at: Date.now() + OTP_TTL_MS, verify_attempts: 0 },
      event,
    );
    await MailerUtilities.sendMail(verificationCodeMail(email, user.username, code, OTP_TTL_MINUTES));
    if (event) event.detail = "new code sent";
  }
}
