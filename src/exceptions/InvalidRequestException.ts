import { BaseExceptions } from "./BaseException.js";

export class InvalidRequestException extends BaseExceptions {
  constructor(fieldName?: string) {
    super(`invalid_request_${fieldName}`, fieldName ? `Invalid request: ${fieldName}` : "Invalid request", 400);
  }
}
