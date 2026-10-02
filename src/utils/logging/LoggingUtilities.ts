import dotenv from "dotenv";
import { IRequestLogContext, IRequestLogEvent, LogStage } from "../../models/IRequestLogContext.js";
import { appendRequestLog } from "./RequestLogFileWriter.js";
import { redactForLog, redactTextForLog, redactUrlForLog } from "./LogRedaction.js";

dotenv.config();

// `html` is Telegram HTML (parse_mode: "HTML"), already escaped.
export interface TelegramLogMessage {
  html: string;
  logSearcherUrl?: string;
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class LoggingUtilities {
  private static readonly appEnv: string = process.env.NODE_ENV ?? "unknown";

  private static readonly INDENT = "│ ";
  private static readonly BRANCH = "├─";
  private static readonly END = "└─";

  private static logSender: ((message: TelegramLogMessage, chatId: number) => void) | null = null;

  static setLogSender(fn: (message: TelegramLogMessage, chatId: number) => void): void {
    LoggingUtilities.logSender = fn;
  }

  // fndom's Log Searcher page (reads ?requestId= and searches on load)
  private static readonly LOG_SEARCHER_URL =
    process.env.NODE_ENV === "prd"
      ? "https://awense.com/admin/log-searcher"
      : "http://localhost:5173/admin/log-searcher";

  constructor() {
    if (!LoggingUtilities.appEnv || LoggingUtilities.appEnv === "unknown") {
      console.log(`Current Environment: ${LoggingUtilities.appEnv}`);

      LoggingUtilities.service.error("LoggingUtilities", "App environment is not set in environment variables");

      throw new Error("App environment is not set in environment variables");
    }
  }

  // =========================================================
  // Timestamp
  // =========================================================

  private static timestamp(): string {
    const d = new Date();

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");

    const ms = String(d.getMilliseconds()).padStart(3, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }

  private static col(value: string, width: number): string {
    return value.length >= width ? value : value.padEnd(width);
  }

  // ── Success-body summarising (keeps logs small; errors stay verbatim) ──
  private static readonly MAX_ARRAY_ITEMS = 3;
  private static readonly MAX_STRING_CHARS = 300;
  private static readonly MAX_DEPTH = 5;
  private static readonly MAX_SUCCESS_BODY_LINES = 40;

  private static summarise(value: unknown, depth: number): unknown {
    if (typeof value === "string") {
      return value.length > LoggingUtilities.MAX_STRING_CHARS
        ? `${value.slice(0, LoggingUtilities.MAX_STRING_CHARS)}… (+${value.length - LoggingUtilities.MAX_STRING_CHARS} chars)`
        : value;
    }
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      // Short lists (roles, tags) stay readable; long ones become a count
      return value.length > LoggingUtilities.MAX_ARRAY_ITEMS
        ? `[${value.length} items]`
        : value.map((item) => LoggingUtilities.summarise(item, depth + 1));
    }
    if (depth >= LoggingUtilities.MAX_DEPTH) return "{…}";
    return Object.fromEntries(
      Object.entries(value).map(([field, fieldValue]) => [field, LoggingUtilities.summarise(fieldValue, depth + 1)]),
    );
  }

  private static readonly MAX_STACK_FRAMES = 8;
  private static readonly PROJECT_ROOT = process.cwd();

  // "at fn (file:///…/qindom/src/x.ts:12:3)" → "at fn (src/x.ts:12:3)"; Node's
  // own internals are dropped since they're never where the bug is.
  private static stackFrames(err: Error | null): string[] | undefined {
    if (!err?.stack) return undefined;
    const frames = err.stack
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("at ") && !line.includes("node:internal"))
      .map((line) => line.replace(/file:\/\//g, "").split(`${LoggingUtilities.PROJECT_ROOT}/`).join(""))
      .slice(0, LoggingUtilities.MAX_STACK_FRAMES);
    return frames.length ? frames : undefined;
  }

  // Console/Telegram are plain text — an emoji is the only "color" available
  // there, unlike the Log Searcher frontend which renders its own icon.
  private static statusIcon(code?: number): string {
    if (code === undefined) return "";
    if (code >= 500) return "❌";
    if (code >= 400) return "⚠️";
    return "✅";
  }

  // =========================================================
  // Request Tree Logger
  // =========================================================

  static request = class {
    // Event types that originate in the service layer once the controller is running
    private static readonly SERVICE_TYPES = new Set<IRequestLogEvent["type"]>([
      "AUTH",
      "SERVICE",
      "SQL",
      "CACHE",
      "QUEUE",
      "DISCORD",
      "TELEGRAM",
      "SYSTEM",
      "HTTP",
    ]);

    /** Middleware while the route's middlewares run; afterwards controller vs service by type. */
    static stageFor(context: IRequestLogContext, type: IRequestLogEvent["type"]): LogStage {
      if ((context.currentStage ?? "middleware") === "middleware") return "middleware";
      return this.SERVICE_TYPES.has(type) ? "service" : "controller";
    }

    /**
     * Append event into request tree.
     */
    static append(context: IRequestLogContext, event: IRequestLogEvent): void {
      context.events.push({
        ...event,
        stage: event.stage ?? this.stageFor(context, event.type),
        timestamp: event.timestamp ?? Date.now(),
      });
    }

    /**
     * For middlewares mounted inside a router (after the controller stage has
     * started), so their events are still attributed to the middleware stage.
     */
    static middleware(context: IRequestLogContext, category: IRequestLogEvent["type"], message: string): IRequestLogEvent {
      const event = this.branch(context, category, message);
      event.stage = "middleware";
      return event;
    }

    /**
     * Append an event into the request tree and return a reference so
     * the caller can update detail/durationMs once the result is known.
     */
    static branch(
      context: IRequestLogContext,
      category: IRequestLogEvent["type"],
      message: string,
      detail?: string,
      durationMs?: number,
    ): IRequestLogEvent {
      const event: IRequestLogEvent = {
        type: category,
        message,
        detail,
        durationMs,
        timestamp: Date.now(),
        level: "DEBUG",
        children: [],
        stage: this.stageFor(context, category),
      };
      context.events.push(event);
      return event;
    }

    /**
     * Convenience helper for errors.
     */
    static error(context: IRequestLogContext, message: string, detail?: string): void {
      context.events.push({
        type: "ERROR",
        message,
        detail,
        children: [],
        timestamp: Date.now(),
        level: "ERROR",
        success: false,
        stage: this.stageFor(context, "ERROR"),
      });
    }

    /**
     * Records the real cause of an unhandled (500) error: where it was caught,
     * the error name/message, and a trimmed stack.
     */
    static exception(context: IRequestLogContext, source: string, error: unknown): void {
      const err = error instanceof Error ? error : null;
      const message = LoggingUtilities.sanitise(err ? err.message : String(error));
      context.events.push({
        type: "ERROR",
        message: `Unhandled exception in ${source}`,
        detail: `${err?.name ?? "Error"}: ${message}`,
        stack: LoggingUtilities.stackFrames(err),
        children: [],
        timestamp: Date.now(),
        level: "ERROR",
        success: false,
        stage: this.stageFor(context, "ERROR"),
      });
    }

    /**
     * Attach response to request context.
     */
    static response(context: IRequestLogContext, statusCode: number, response?: unknown): void {
      context.statusCode = statusCode;
      // Successful bodies are summarised (lists → "[N items]"); 4xx/5xx keep the
      // full body since that's when the detail is actually needed.
      context.response = statusCode < 400 ? LoggingUtilities.summarise(response, 0) : response;
    }

    /**
     * Telegram alert: one access-log line, e.g.
     *   127.0.0.1 - - [07/Jan/2026 00:01:25] "POST /login HTTP/1.1" 200 -
     * The full tree, bodies and stack are behind the Log Searcher link.
     */
    private static renderCompact(context: IRequestLogContext): TelegramLogMessage {
      const d = new Date(context.startTime);
      const pad = (n: number) => String(n).padStart(2, "0");
      const month = d.toLocaleString("en-US", { month: "short" });
      const time = `${pad(d.getDate())}/${month}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const route = context.path.split("?")[0];
      const httpVersion = context.httpVersion ?? "1.1";

      const line = `${context.ip} - - [${time}] "${context.method} ${route} HTTP/${httpVersion}" ${context.statusCode ?? "-"} -`;

      return {
        html: `<code>${escapeHtml(line)}</code>`,
        logSearcherUrl: `${LoggingUtilities.LOG_SEARCHER_URL}?requestId=${encodeURIComponent(context.requestId)}`,
      };
    }

    /**
     * Build the verbose request tree text (console + request-log file, which
     * the Log Searcher reads): payload, every event, stack traces, response body.
     */
    private static render(context: IRequestLogContext, duration: number): string[] {
      const lines: string[] = [];

      lines.push(`\n[${LoggingUtilities.timestamp()}] ${context.protocol ?? "HTTP"} ${context.method} ${context.path}`);
      lines.push(`${LoggingUtilities.INDENT}RequestId : ${context.requestId}`);
      lines.push(`${LoggingUtilities.INDENT}IP        : ${context.ip}`);

      if (context.payload) {
        lines.push(`${LoggingUtilities.INDENT}Payload   : ${JSON.stringify(context.payload, null, 0)}`);
      }

      lines.push("");

      let previousStage: LogStage | undefined;
      for (const event of context.events) {
        // Stage marker whenever the pipeline stage changes (read back by RequestLogParser)
        if (event.stage && event.stage !== previousStage) {
          lines.push(`│ ── ${event.stage}`);
          previousStage = event.stage;
        }

        const icon = event.level === "ERROR" ? "✖" : "├─";

        lines.push(`${icon} ${LoggingUtilities.col(event.type, 10)} ${event.message}`);

        if (event.children?.length) {
          event.children.forEach((child, index) => {
            const childPrefix =
              index === event.children.length - 1 && !event.detail && event.durationMs === undefined ? "└─" : "├─";

            lines.push(`│  ${childPrefix} ${child}`);
          });
        }

        const hasStack = !!event.stack?.length;

        if (event.detail) {
          const prefix = event.durationMs === undefined && !hasStack ? "└─" : "├─";
          lines.push(`│  ${prefix} ${event.detail}`);
        }

        if (event.durationMs !== undefined) {
          lines.push(`│  ${hasStack ? "├─" : "└─"} ${event.durationMs}ms`);
        }

        if (hasStack) {
          lines.push(`│  └─ stack`);
          event.stack!.forEach((frame) => lines.push(`│       ${frame}`));
        }

        lines.push("");
      }

      lines.push(`${LoggingUtilities.END} RESPONSE ${context.statusCode} ${LoggingUtilities.statusIcon(context.statusCode)}`);

      if (context.response !== undefined) {
        let respLines = JSON.stringify(context.response, null, 2).split("\n");
        const isSuccess = (context.statusCode ?? 0) < 400;
        if (isSuccess && respLines.length > LoggingUtilities.MAX_SUCCESS_BODY_LINES) {
          const hidden = respLines.length - LoggingUtilities.MAX_SUCCESS_BODY_LINES;
          respLines = [...respLines.slice(0, LoggingUtilities.MAX_SUCCESS_BODY_LINES), `… (${hidden} more lines)`];
        }
        lines.push(`   ${LoggingUtilities.END} ${respLines[0]}`);
        for (let i = 1; i < respLines.length; i++) {
          lines.push(`   ${respLines[i]}`);
        }
      }

      lines.push(`\nDuration: ${duration}ms\n`);

      return lines;
    }

    /**
     * Flush request tree.
     * `telegramChatIds` — one Telegram send per chat id in this list (each chat
     * may have muted this request's module independently); console/file output
     * is always written regardless of this list being empty.
     */
    static flush(context: IRequestLogContext, options?: { telegramChatIds?: number[] }): void {
      const duration = Date.now() - context.startTime;
      const renderedLines = this.render(context, duration);

      renderedLines.forEach((line: string) => console.log(line));
      appendRequestLog(renderedLines.join("\n"));

      const chatIds = options?.telegramChatIds;
      if (LoggingUtilities.logSender && chatIds?.length) {
        const compactMessage = this.renderCompact(context);
        for (const chatId of chatIds) {
          LoggingUtilities.logSender(compactMessage, chatId);
        }
      }
    }
  };

  // =========================================================
  // Generic Non-Request Logs
  // =========================================================

  static service = class {
    static info(serviceName: string, message: string): void {
      console.log(`${LoggingUtilities.timestamp()} | INFO  | ${LoggingUtilities.col(serviceName, 30)} | ${message}`);
    }

    static warn(serviceName: string, message: string): void {
      console.warn(`${LoggingUtilities.timestamp()} | WARN  | ${LoggingUtilities.col(serviceName, 30)} | ${message}`);
    }

    static debug(serviceName: string, message: string): void {
      console.log(`${LoggingUtilities.timestamp()} | DEBUG | ${LoggingUtilities.col(serviceName, 30)} | ${message}`);
    }

    static error(serviceName: string, message: string): void {
      console.error(`${LoggingUtilities.timestamp()} | ERROR | ${LoggingUtilities.col(serviceName, 30)} | ${message}`);
    }
  };

  // =========================================================
  // Sanitiser
  // =========================================================

  /** Free text (error messages). Structured data should go through redact(). */
  static sanitise(value: string): string {
    return redactTextForLog(value);
  }

  /** Deep copy with sensitive fields redacted by name — see LogRedaction.ts. */
  static redact(value: unknown): unknown {
    return redactForLog(value);
  }

  static redactUrl(url: string): string {
    return redactUrlForLog(url);
  }
}
