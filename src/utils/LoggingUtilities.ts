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

  private static timestamp(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private static col(value: string, width: number): string {
    return value.length >= width ? value : value.padEnd(width);
  }

  // ======================
  // Controller logs
  // ======================
  static controller = class {
    static start(verb: string, path: string, message: string): void {
      console.log(
        `${LoggingUtilities.timestamp()} | DEBUG | ${LoggingUtilities.col(`${verb} ${path}`, 30)} | ENTER | ${message}`
      );
    }

    static end(verb: string, path: string, message: string): void {
      console.log(
        `${LoggingUtilities.timestamp()} | DEBUG | ${LoggingUtilities.col(`${verb} ${path}`, 30)} | EXIT  | ${message}`
      );
    }

    static access(ip: string, verb: string, path: string, _httpVersion: string, status: number, message: string): void {
      console.log(
        `${LoggingUtilities.timestamp()} | ${LoggingUtilities.col(verb, 5)} | ${LoggingUtilities.col(path, 30)} | ${status} | ${ip} | ${message}`
      );
    }
  };

  // ======================
  // Service logs
  // ======================
  static service = class {
    static info(serviceName: string, message: string): void {
      console.log(
        `${LoggingUtilities.timestamp()} | INFO  | ${LoggingUtilities.col(serviceName, 30)} | ${message}`
      );
    }

    static warn(serviceName: string, message: string): void {
      console.warn(
        `${LoggingUtilities.timestamp()} | WARN  | ${LoggingUtilities.col(serviceName, 30)} | ${message}`
      );
    }

    static debug(serviceName: string, message: string): void {
      console.log(
        `${LoggingUtilities.timestamp()} | DEBUG | ${LoggingUtilities.col(serviceName, 30)} | ${message}`
      );
    }

    static error(serviceName: string, message: string): void {
      console.error(
        `${LoggingUtilities.timestamp()} | ERROR | ${LoggingUtilities.col(serviceName, 30)} | ${message}`
      );
    }
  };
}
