import { BaseExceptions } from "./BaseException";

export class ForbiddenAccessException extends BaseExceptions {
  constructor(message?: string) {
    super("forbidden_access", message ?? "Forbidden", 403);
  }
}
