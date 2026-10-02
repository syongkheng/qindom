/** Where in the request pipeline an event was recorded. */
export type LogStage = "middleware" | "controller" | "service";

export interface IRequestLogContext {
  requestId: string;
  /** Set to "middleware" by RestRequestLogger; flipped to "controller" once the route's middlewares pass (index.ts). */
  currentStage?: LogStage;
  startTime: number;
  protocol?: string;
  httpVersion?: string;
  method: string;
  path: string;
  ip: string;
  events: IRequestLogEvent[];
  payload?: unknown;
  response?: unknown;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

export type LogEventType =
  | "HTTP"
  | "AUTH"
  | "SQL"
  | "SERVICE"
  | "CACHE"
  | "QUEUE"
  | "DISCORD"
  | "TELEGRAM"
  | "SYSTEM"
  | "ERROR"
  | "WARN"
  | "VALIDATION";

export interface IRequestLogEvent {
  /**
   * Category of the log event.
   * Used for grouping / formatting.
   */
  type: LogEventType;

  /**
   * Human-readable message.
   */
  message: string;

  /**
   * Optional child/detail message.
   *
   * Example:
   * "12ms"
   * "email found"
   * "cache hit"
   */
  detail?: string;

  children: string[];

  /**
   * Optional structured metadata.
   * Useful for debugging / JSON logs.
   */

  /**
   * Time spent for this operation.
   */
  durationMs?: number;

  /**
   * Timestamp of the event.
   */
  timestamp: number;

  /**
   * Log severity.
   */
  level?: "DEBUG" | "INFO" | "WARN" | "ERROR";

  /**
   * Whether this event represents a failure.
   */
  success?: boolean;

  /**
   * Trimmed stack frames for unhandled exceptions — rendered only in the
   * verbose output (console / request-log file / Log Searcher), never Telegram.
   */
  stack?: string[];

  /** Pipeline stage — assigned by LoggingUtilities.request when the event is recorded. */
  stage?: LogStage;
}
