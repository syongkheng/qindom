import dotenv from "dotenv";
import { IRequestLogContext, IRequestLogEvent } from "../../models/IRequestLogContext.js";

dotenv.config();

export class LoggingUtilities {
  private static readonly appEnv: string = process.env.NODE_ENV ?? "unknown";

  private static readonly INDENT = "│ ";
  private static readonly BRANCH = "├─";
  private static readonly END = "└─";

  private static logSender: ((text: string) => void) | null = null;

  static setLogSender(fn: (text: string) => void): void {
    LoggingUtilities.logSender = fn;
  }

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

  // =========================================================
  // Request Tree Logger
  // =========================================================

  static request = class {
    /**
     * Append event into request tree.
     */
    static append(context: IRequestLogContext, event: IRequestLogEvent): void {
      context.events.push({
        ...event,
        timestamp: event.timestamp ?? Date.now(),
      });
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
      });
    }

    /**
     * Attach response to request context.
     */
    static response(context: IRequestLogContext, statusCode: number, response?: unknown): void {
      context.statusCode = statusCode;
      context.response = response;
    }

    /**
     * Flush request tree.
     * `skipTelegram` suppresses the Telegram send only — console output is unaffected.
     */
    static flush(context: IRequestLogContext, options?: { skipTelegram?: boolean }): void {
      const duration = Date.now() - context.startTime;
      const lines: string[] = [];

      lines.push(`\n[${LoggingUtilities.timestamp()}] ${context.protocol ?? "HTTP"} ${context.method} ${context.path}`);
      lines.push(`${LoggingUtilities.INDENT}RequestId : ${context.requestId}`);
      lines.push(`${LoggingUtilities.INDENT}IP        : ${context.ip}`);

      if (context.payload) {
        lines.push(`${LoggingUtilities.INDENT}Payload   : ${JSON.stringify(context.payload, null, 0)}`);
      }

      lines.push("");

      for (const event of context.events) {
        const icon = event.level === "ERROR" ? "✖" : "├─";

        lines.push(`${icon} ${LoggingUtilities.col(event.type, 10)} ${event.message}`);

        if (event.children?.length) {
          event.children.forEach((child, index) => {
            const childPrefix =
              index === event.children.length - 1 && !event.detail && event.durationMs === undefined ? "└─" : "├─";

            lines.push(`│  ${childPrefix} ${child}`);
          });
        }

        if (event.detail) {
          const prefix = event.durationMs === undefined ? "└─" : "├─";
          lines.push(`│  ${prefix} ${event.detail}`);
        }

        if (event.durationMs !== undefined) {
          lines.push(`│  └─ ${event.durationMs}ms`);
        }

        lines.push("");
      }

      lines.push(`${LoggingUtilities.END} RESPONSE ${context.statusCode}`);

      if (context.response !== undefined) {
        const respLines = JSON.stringify(context.response, null, 2).split("\n");
        lines.push(`   ${LoggingUtilities.END} ${respLines[0]}`);
        for (let i = 1; i < respLines.length; i++) {
          lines.push(`   ${respLines[i]}`);
        }
      }

      lines.push(`\nDuration: ${duration}ms\n`);

      const text = lines.join("\n");
      lines.forEach((line) => console.log(line));

      if (LoggingUtilities.logSender && !options?.skipTelegram) LoggingUtilities.logSender(text);
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

  static sanitise(value: string): string {
    return value
      .replace(/"password"\s*:\s*".*?"/gi, '"password":"[REDACTED]"')
      .replace(/"blob"\s*:\s*"[^"]*"/gi, '"blob":"[REDACTED]"')
      .replace(/"blobString"\s*:\s*"[^"]*"/gi, '"blobString":"[REDACTED]"')
      .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[REDACTED]"')
      .replace(/"email"\s*:\s*"([^"]*)"/gi, (_, email: string) => {
        const atIdx = email.indexOf("@");
        if (atIdx <= 0) return `"email":"${email}"`;
        return `"email":"${email.charAt(0)}***${email.slice(atIdx)}"`;
      });
  }
}
