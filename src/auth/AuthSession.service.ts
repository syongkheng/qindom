import bcrypt from "bcrypt";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { MailerUtilities } from "../utils/MailerUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { maskEmail } from "../utils/logging/LogRedaction.js";
import { signToken, verifyToken } from "../token/Token.service.js";
import { parseRoles } from "./Permission.js";
import { passwordChangedMail } from "./Auth.emailTemplate.js";
import {
  AuthIssuedSession,
  AuthLoginBody,
  AuthPasswordUpdateBody,
  AuthPasswordValidityDto,
  UserState,
} from "./Auth.types.js";

export const AA_USER_TABLE = "tb_aa_user";
export const BCRYPT_SALT_ROUNDS = 10;

/** Columns `issueSession` needs. */
export const SESSION_COLUMNS = ["id", "username", "system", "roles", "last_logged_in_dt"] as const;
const LOGIN_COLUMNS = [...SESSION_COLUMNS, "password", "email_verified"];
const PASSWORD_UPDATE_COLUMNS = [...SESSION_COLUMNS, "password", "email"];

type SessionUser = Pick<ITB_AA_USER, (typeof SESSION_COLUMNS)[number]>;

/** Logins, session tokens and password changes for `tb_aa_user`. */
export class AuthSessionService {
  constructor(private db: KnexSqlUtilities) {}

  async login({ email, password, system }: AuthLoginBody, logContext?: IRequestLogContext): Promise<AuthIssuedSession> {
    const event = LoggingUtilities.request.branch(logContext, "AUTH", "Authenticating user");
    const user = await this.db.findOne<ITB_AA_USER>(
      AA_USER_TABLE,
      { email, system, record_status: RecordStatus.ACTIVE },
      LOGIN_COLUMNS,
      event,
    );
    if (!user) {
      if (event) event.detail = "user not found";
      throw new Exceptions.InvalidLoginCredentials();
    }
    if (!(await bcrypt.compare(password, user.password))) {
      if (event) event.detail = "invalid password";
      throw new Exceptions.InvalidLoginCredentials();
    }
    if (user.email_verified !== 1) {
      if (event) event.detail = "email not verified";
      LoggingUtilities.service.warn("AuthSessionService.login", `Unverified login attempt for ${maskEmail(email)}`);
      throw new Exceptions.EmailNotVerified();
    }
    if (event) event.detail = "authenticated";
    return this.issueSession(user, event);
  }

  /**
   * Signs a new JWT and stores it as the user's only valid token (MandatoryTokenFilter rejects any
   * cookie whose token != tb_aa_user.token), so issuing a session revokes every other one.
   * Written by `{ id, record_status: ACTIVE }`: soft-deleted rows sharing the `username_system` never get it.
   */
  async issueSession(user: SessionUser, event?: IRequestLogEvent): Promise<AuthIssuedSession> {
    const roles = parseRoles(user.roles);
    const token = signToken({
      id: user.id!,
      username: user.username,
      system: user.system,
      roles,
      lastLoggedInDt: user.last_logged_in_dt,
    });
    await this.db.update<ITB_AA_USER>(
      AA_USER_TABLE,
      { id: user.id, record_status: RecordStatus.ACTIVE },
      { token, last_logged_in_dt: Date.now(), state: UserState.ACTIVE },
      event,
    );
    return { token, session: { username: user.username, roles } };
  }

  /**
   * Logout-side revocation: clears the stored token so the cookie can't be replayed.
   * Best-effort and never throws: an invalid/expired/forged token means there is nothing to
   * revoke, and a DB failure must not stop logout from clearing the cookies.
   */
  async invalidateSession(token: string, logContext?: IRequestLogContext): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "AUTH", "Revoking session token");
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      if (event) event.detail = "no valid token, nothing to revoke";
      return;
    }
    try {
      await this.db.update<ITB_AA_USER>(
        AA_USER_TABLE,
        { username_system: `${decoded.username}_${decoded.system}`, record_status: RecordStatus.ACTIVE },
        { token: "" },
        event,
      );
      if (event) event.detail = "token revoked";
    } catch (err) {
      if (event) event.detail = "revocation failed";
      LoggingUtilities.service.warn(
        "AuthSessionService.invalidateSession",
        `Token revocation failed: ${toMessage(err)}`,
      );
    }
  }

  async validatePassword(
    userId: number,
    password: string,
    logContext?: IRequestLogContext,
  ): Promise<AuthPasswordValidityDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Validating password");
    const user = await this.db.findOne<ITB_AA_USER>(
      AA_USER_TABLE,
      { id: userId, record_status: RecordStatus.ACTIVE },
      ["id", "password"],
      event,
    );
    if (!user) throw new Exceptions.InvalidLoginCredentials();
    const isValid = await bcrypt.compare(password, user.password);
    if (event) event.detail = isValid ? "valid" : "invalid";
    return { isValid };
  }

  /**
   * Requires the current password (a session cookie alone must not be enough), then rotates the
   * token so every other session drops. Returns the new token for the caller's cookie.
   */
  async updatePassword(
    userId: number,
    { currentPassword, newPassword }: AuthPasswordUpdateBody,
    logContext?: IRequestLogContext,
  ): Promise<{ token: string }> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Updating password");
    const user = await this.db.findOne<ITB_AA_USER>(
      AA_USER_TABLE,
      { id: userId, record_status: RecordStatus.ACTIVE },
      PASSWORD_UPDATE_COLUMNS,
      event,
    );
    if (!user) throw new Exceptions.InvalidLoginCredentials();
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      if (event) event.detail = "current password incorrect";
      throw new Exceptions.InvalidLoginCredentials();
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.db.update<ITB_AA_USER>(
      AA_USER_TABLE,
      { id: user.id, record_status: RecordStatus.ACTIVE },
      { password: hashedPassword },
      event,
    );
    const { token } = await this.issueSession(user, event);
    if (event) event.detail = "password updated, token rotated";

    const { email } = user;
    if (email) {
      // Fire-and-forget: a mail failure must not fail the change.
      MailerUtilities.sendMail(passwordChangedMail(email, user.username)).catch(() => {
        LoggingUtilities.service.warn(
          "AuthSessionService.updatePassword",
          `Failed to send password-change notification to ${maskEmail(email)}`,
        );
      });
    }
    return { token };
  }
}
