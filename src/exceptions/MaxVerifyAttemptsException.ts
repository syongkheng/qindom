import { BaseExceptions } from "./BaseException.js";

export class MaxVerifyAttemptsException extends BaseExceptions {
  constructor() {
    super("max_verify_attempts", "Too many incorrect attempts. Please request a new verification code.", 401);
  }
}
