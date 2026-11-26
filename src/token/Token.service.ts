import jwt from "jsonwebtoken";
import { Time } from "../constants/Time.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IDecodedTokenUser } from "./Token.types.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";

/** The only algorithm we sign with and accept (pinned so `alg: none` / RS↔HS confusion can't happen). */
export const JWT_ALGORITHM = "HS256";
/** Session length. The auth cookie's `maxAge` uses the same value. */
export const JWT_TTL_MS = 30 * Time.DAY_MS;

const JWT_SECRET_ENV = "JWT_SECRET";

/**
 * Read lazily: dotenv runs in index.ts after all imports are evaluated (ESM hoisting),
 * so the env var isn't there yet at import time. index.ts calls this once at boot to fail fast.
 */
export function getJwtSecret(): string {
  const secret = process.env[JWT_SECRET_ENV];
  if (!secret) throw new Error(`${JWT_SECRET_ENV} environment variable not set`);
  return secret;
}

/** Signs a session JWT. Throws `UnknownException` if signing fails. */
export function signToken(payload: IDecodedTokenUser): string {
  try {
    const { id, username, system, roles, lastLoggedInDt } = payload;
    return jwt.sign({ id, username, system, roles, lastLoggedInDt }, getJwtSecret(), {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_TTL_MS / Time.SECOND_MS,
    });
  } catch (error) {
    LoggingUtilities.service.error("TokenService.signToken", `Failed to sign token: ${toMessage(error)}`);
    throw new Exceptions.Unknown();
  }
}

/**
 * Verifies signature, algorithm and expiry. Throws jsonwebtoken's errors unchanged
 * (callers distinguish `jwt.TokenExpiredError`). Does NOT check DB revocation.
 */
export function verifyToken(token: string): IDecodedTokenUser {
  return jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] }) as IDecodedTokenUser;
}
