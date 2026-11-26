import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";

export const CRASH_GUARD_TAG = "crashGuard";
export const UNCAUGHT_EXCEPTION = "uncaughtException";
export const UNHANDLED_REJECTION = "unhandledRejection";

type ErrorLogger = (serviceName: string, message: string) => void;

/** The subset of `process` the guard needs (a plain EventEmitter in tests). */
export interface CrashGuardTarget {
  on(event: typeof UNCAUGHT_EXCEPTION, listener: (error: unknown) => void): unknown;
  on(event: typeof UNHANDLED_REJECTION, listener: (reason: unknown) => void): unknown;
}

/** "<message>\n<stack>" for an Error, the stringified value otherwise. */
export function describeCrash(error: unknown): string {
  const message = toMessage(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return stack ? `${message}\n${stack}` : message;
}

/**
 * Process-level backstop (user decision C2): an error that escapes every handler (a stream or event
 * callback nobody awaits, a forgotten promise) is logged to PM2 with its stack and the process KEEPS
 * RUNNING, so one bad request can't take the API down for everyone. Registering a listener is what
 * stops Node's default exit. Boot failures still exit: `startServer().catch` and `initializeDatabase`.
 * Trade-off documented in config/README.md.
 */
export function installCrashGuard(
  target: CrashGuardTarget = process,
  log: ErrorLogger = LoggingUtilities.service.error,
) {
  target.on(UNCAUGHT_EXCEPTION, (error) => {
    log(CRASH_GUARD_TAG, `[${UNCAUGHT_EXCEPTION}] process kept running: ${describeCrash(error)}`);
  });
  target.on(UNHANDLED_REJECTION, (reason) => {
    log(CRASH_GUARD_TAG, `[${UNHANDLED_REJECTION}] process kept running: ${describeCrash(reason)}`);
  });
}
