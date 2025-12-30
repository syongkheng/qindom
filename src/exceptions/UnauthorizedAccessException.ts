import { BaseExceptions } from "./BaseException";

export class UnauthorizedAccessException extends BaseExceptions {
  constructor() {
    super("unauthorized_access", "Unauthorized access", 401);
  }
}
