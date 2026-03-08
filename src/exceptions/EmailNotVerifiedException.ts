import { BaseExceptions } from "./BaseException";

export class EmailNotVerifiedException extends BaseExceptions {
  constructor() {
    super("email_not_verified", "Email address has not been verified. Please check your inbox.", 403);
  }
}
