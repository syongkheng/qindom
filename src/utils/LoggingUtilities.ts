export class LoggingUtilities {
  constructor() {}

  public static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  }

  static controller = class {
    static start(verb: string, path: string, message: string): void {
      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [${verb}] [${path}] - [ENTR] - ${message}`
      );
    }

    static end(verb: string, path: string, message: string): void {
      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [${verb}] [${path}] - [EXIT] - ${message}`
      );
    }
  };

  static service = class {
    static info(serviceName: string, message: string): void {
      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [I] [${serviceName}] - ${message}`
      );
    }

    static warn(serviceName: string, message: string): void {
      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [W] [${serviceName}] - ${message}`
      );
    }

    static debug(serviceName: string, message: string): void {
      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [D] [${serviceName}] - ${message}`
      );
    }

    static error(serviceName: string, message: string): void {
      console.log(
        `[${LoggingUtilities.formatDate(
          new Date()
        )}] [E] [${serviceName}] - ${message}`
      );
    }
  };
}
