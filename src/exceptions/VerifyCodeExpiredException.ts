import { BaseExceptions } from "./BaseException";

export class VerifyCodeExpiredException extends BaseExceptions {
  constructor() {
    super("code_expired", "Your verification code has expired. Please request a new one.", 401);
  }
}
