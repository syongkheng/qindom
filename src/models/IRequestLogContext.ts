export interface IRequestLogContext {
  requestId: string;
  startTime: number;
  protocol?: string;
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
}
