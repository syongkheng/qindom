import { BaseExceptions } from "./BaseException.js";

export class InvalidLoginCredentialsException extends BaseExceptions {
  constructor() {
    super("invalid_login_credentials", "Invalid login credentials", 401);
  }
}
