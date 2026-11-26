/**
 * Every typed exception the API throws. Always throw through the registry: `throw new Exceptions.NotFound(...)`.
 *
 * Client contract (keep stable):
 * - `code` is read by fndom to pick a translated message (e.g. `invalid_request_email`, `max_verify_attempts`).
 * - The class name is sent as the envelope `status` (`this.name`), so don't rename classes casually.
 * - `route()` / `handleException` map `httpStatus` → response status and `toResponseMessage()` → `data`.
 */

export class BaseException extends Error {
  public readonly timestamp: number;

  constructor(
    public readonly code: string,
    public readonly clientMessage: string,
    public readonly httpStatus: number,
    public readonly fieldName?: string,
    public readonly typeOfError?: string,
  ) {
    super(clientMessage);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    Error.captureStackTrace(this, this.constructor);
  }

  toResponseMessage() {
    return {
      code: this.code,
      fieldName: this.fieldName,
      typeOfError: this.typeOfError,
      message: this.message,
      timestamp: this.timestamp,
    };
  }
}

// ── 400 Bad Request ─────────────────────────────────────────────

const INVALID_REQUEST_MESSAGES = {
  mandatory: (field: string) => `Missing field - ${field}`,
  format: (field: string) => `Invalid format - ${field}`,
  limit: (field: string) => `Limit reached - ${field}`,
} as const;

export type InvalidRequestErrorType = keyof typeof INVALID_REQUEST_MESSAGES;

/** `fieldName` is the offending field (not a sentence); it becomes the code `invalid_request_<field>`. */
export class InvalidRequestException extends BaseException {
  constructor(fieldName?: string, errorType?: InvalidRequestErrorType) {
    const message =
      fieldName && errorType
        ? INVALID_REQUEST_MESSAGES[errorType](fieldName)
        : fieldName
          ? `Invalid request: ${fieldName}`
          : "Invalid request";
    super(`invalid_request_${fieldName ?? "generic"}`, message, 400, fieldName, errorType);
  }
}

export class WeakPasswordException extends BaseException {
  constructor() {
    super("weak_password", "The provided password is too weak.", 400);
  }
}

export class VerifyCodeExpiredException extends BaseException {
  constructor() {
    super("code_expired", "Your verification code has expired. Please request a new one.", 400);
  }
}

// ── 401 Unauthorized ────────────────────────────────────────────

export class UnauthorizedAccessException extends BaseException {
  constructor(message = "Unauthorized access") {
    super("unauthorized_access", message, 401);
  }
}

export class InvalidLoginCredentialsException extends BaseException {
  constructor() {
    super("invalid_login_credentials", "Invalid login credentials", 401);
  }
}

// ── 403 Forbidden ───────────────────────────────────────────────

export class ForbiddenAccessException extends BaseException {
  constructor(message = "Forbidden") {
    super("forbidden_access", message, 403);
  }
}

export class EmailNotVerifiedException extends BaseException {
  constructor() {
    super("email_not_verified", "Email address has not been verified. Please check your inbox.", 403);
  }
}

// ── 404 Not Found ───────────────────────────────────────────────

export class EntityNotFoundException extends BaseException {
  constructor(message = "Entity not found") {
    super("entity_not_found", message, 404);
  }
}

// ── 409 Conflict ────────────────────────────────────────────────

export class EmailAlreadyRegisteredException extends BaseException {
  constructor() {
    super("email_already_registered", "This email is already registered.", 409);
  }
}

export class UsernameAlreadyTakenException extends BaseException {
  constructor() {
    super("username_already_taken", "This username is already taken.", 409);
  }
}

// ── 415 Unsupported Media Type ──────────────────────────────────

/** A body-carrying request (POST) that isn't JSON. Thrown by `RequestHeaderFilter`. */
export class UnsupportedMediaTypeException extends BaseException {
  constructor() {
    super("unsupported_media_type", "Content-Type must be application/json", 415);
  }
}

// ── 429 Too Many Requests ───────────────────────────────────────

export class MaxVerifyAttemptsException extends BaseException {
  constructor() {
    super("max_verify_attempts", "Too many incorrect attempts. Please request a new verification code.", 429);
  }
}

// ── 500 Internal Server Error ───────────────────────────────────

export class UnknownException extends BaseException {
  constructor() {
    super("unknown", "Something went wrong", 500);
  }
}

export class RegistrationException extends BaseException {
  constructor() {
    super("registration_failed", "Something went wrong during registration.", 500);
  }
}

export class EntityCreationException extends BaseException {
  constructor(entityName?: string) {
    super(
      "entity_creation_failed",
      entityName ? `Entity creation failed for ${entityName}` : "Entity creation failed",
      500,
    );
  }
}

export class EntityUpdateException extends BaseException {
  constructor(entityName?: string) {
    super("entity_update_failed", entityName ? `Entity update failed for ${entityName}` : "Entity update failed", 500);
  }
}

// ── 502 Bad Gateway ─────────────────────────────────────────────

export class ExternalRequestException extends BaseException {
  constructor(externalService: string) {
    super("external_request_exception", `Something went wrong calling external service: ${externalService}`, 502);
  }
}

// ── Registry ────────────────────────────────────────────────────

export const Exceptions = {
  InvalidRequest: InvalidRequestException,
  WeakPassword: WeakPasswordException,
  VerifyCodeExpired: VerifyCodeExpiredException,
  UnauthorizedAccess: UnauthorizedAccessException,
  InvalidLoginCredentials: InvalidLoginCredentialsException,
  ForbiddenAccess: ForbiddenAccessException,
  EmailNotVerified: EmailNotVerifiedException,
  NotFound: EntityNotFoundException,
  EmailAlreadyRegistered: EmailAlreadyRegisteredException,
  UsernameAlreadyTaken: UsernameAlreadyTakenException,
  UnsupportedMediaType: UnsupportedMediaTypeException,
  MaxVerifyAttempts: MaxVerifyAttemptsException,
  Unknown: UnknownException,
  Registration: RegistrationException,
  EntityCreation: EntityCreationException,
  EntityUpdate: EntityUpdateException,
  ExternalRequest: ExternalRequestException,
} as const;

export type ExceptionsType = typeof Exceptions;
