import { BaseExceptions } from "./BaseException.js";

export class ForbiddenAccessException extends BaseExceptions {
  constructor(message?: string) {
    super("forbidden_access", message ?? "Forbidden", 403);
  }
}
