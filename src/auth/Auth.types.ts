// Request bodies and response DTOs for /auth. Request-log DTOs stay in models/dtos/RequestLogDto.ts
// (shared with utils/logging); the Telegram matrix type lives with TelegramLogSubscriptionService.

/** `tb_aa_user.state` values. */
export const UserState = {
  /** Registered, email not verified yet. */
  REGISTER: "REGISTER",
  ACTIVE: "ACTIVE",
} as const;
export type UserState = (typeof UserState)[keyof typeof UserState];

// ── Request bodies ─────────────────────────────────────────────

/** `/preflight` and `/resend-verify`. `email` is lowercased + trimmed. */
export interface AuthEmailBody {
  email: string;
  system: string;
}

export interface AuthLoginBody extends AuthEmailBody {
  password: string;
}

export interface AuthRegisterBody extends AuthLoginBody {
  username: string;
}

export interface AuthVerifyEmailBody extends AuthLoginBody {
  /** 6 digits. */
  code: string;
}

export interface AuthPasswordValidateBody {
  password: string;
}

export interface AuthPasswordUpdateBody {
  currentPassword: string;
  newPassword: string;
}

export interface AuthUserRolesBody {
  roles: string[];
}

export interface AuthTelegramLogToggleBody {
  enabled: boolean;
}

// ── Responses ──────────────────────────────────────────────────

export interface AuthPreflightDto {
  exist: boolean;
  nextStep: "register" | "login";
}

export interface AuthRegisteredDto {
  requiresVerification: true;
  email: string;
}

/** Login / verify-email response. The JWT itself only ever travels in the `jwt_token` cookie. */
export interface AuthSessionDto {
  username: string;
  roles: string[];
}

/** Service result for a new session: the controller sets `token` as a cookie and returns only `session`. */
export interface AuthIssuedSession {
  token: string;
  session: AuthSessionDto;
}

export interface AuthVerificationDto extends AuthSessionDto {
  exist: true;
}

export interface AuthVerifyCodeSentDto {
  sent: true;
}

export interface AuthLoggedOutDto {
  loggedOut: true;
}

export interface AuthPasswordValidityDto {
  isValid: boolean;
}

export interface AuthUpdatedDto {
  updated: true;
}

/** One row of the admin user list. Never includes the password hash, token or OTP fields. */
export interface AuthAdminUserDto {
  id: number;
  username: string;
  email: string | null;
  system: string;
  roles: string[];
  state: string;
  lastLoggedInDt: number | null;
  createdDt: number;
}
