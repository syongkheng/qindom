import { BaseExceptions } from "./BaseException.js";

export class UnauthorizedAccessException extends BaseExceptions {
  constructor() {
    super("unauthorized_access", "Unauthorized access", 401);
  }
}
