import { BaseExceptions } from "./BaseException";

export class InvalidLoginCredentialsException extends BaseExceptions {
  constructor() {
    super("invalid_login_credentials", "Invalid login credentials", 401);
  }
}
