export class BaseExceptions extends Error {
  public readonly timestamp: number;

  constructor(
    public readonly code: string,
    public readonly clientMessage: string,
    public readonly httpStatus: number = 400,
    public readonly fieldName?: string,
    public readonly typeOfError?: string,
  ) {
    super(clientMessage);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    Error.captureStackTrace(this, this.constructor);
  }

  toResponseMessage() {
    return {
      code: this.code,
      fieldName: this.fieldName,
      typeOfError: this.typeOfError,
      message: this.message,
      timestamp: this.timestamp,
    };
  }
}
