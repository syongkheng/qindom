import dotenv from "dotenv";
dotenv.config();

export class LoggingUtilities {
  private static readonly appEnv: string = process.env.NODE_ENV ?? "unknown";

  constructor() {
    if (!LoggingUtilities.appEnv || LoggingUtilities.appEnv === "unknown") {
      console.log(`Current Environment: ${LoggingUtilities.appEnv}`);
      LoggingUtilities.service.error(
        "LoggingUtilities",
        "App environment is not set in environment variables"
      );
      throw new Error("App environment is not set in environment variables");
    }
  }

  private static shouldLog(): boolean {
    // Only log in prd
    return LoggingUtilities.appEnv === "prd" || LoggingUtilities.appEnv === "dev_log";
  }

  public static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  }

  // ======================
  // Controller logs
  // ======================
  static controller = class {
    static start(verb: string, path: string, message: string): void {
      if (!LoggingUtilities.shouldLog()) return;

      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [${verb}] [${path}] - [ENTR] - ${message}`
      );
    }

    static end(verb: string, path: string, message: string): void {
      if (!LoggingUtilities.shouldLog()) return;

      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [${verb}] [${path}] - [EXIT] - ${message}`
      );
    }
  };

  // ======================
  // Service logs
  // ======================
  static service = class {
    static info(serviceName: string, message: string): void {
      if (!LoggingUtilities.shouldLog()) return;

      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [I] [${serviceName}] - ${message}`
      );
    }

    static warn(serviceName: string, message: string): void {
      if (!LoggingUtilities.shouldLog()) return;

      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [W] [${serviceName}] - ${message}`
      );
    }

    static debug(serviceName: string, message: string): void {
      if (!LoggingUtilities.shouldLog()) return;

      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [D] [${serviceName}] - ${message}`
      );
    }

    static error(serviceName: string, message: string): void {
      if (!LoggingUtilities.shouldLog()) return;

      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [E] [${serviceName}] - ${message} \n===== END ======`
      );
    }
  };
}
