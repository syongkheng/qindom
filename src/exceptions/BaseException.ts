export class BaseExceptions extends Error {
  public readonly timestamp: number;

  constructor(
    public readonly code: string,
    public readonly clientMessage: string,
    public readonly httpStatus: number = 400
  ) {
    super(clientMessage);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    Error.captureStackTrace(this, this.constructor);
  }

  toResponseMessage() {
    return {
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
    };
  }
}
