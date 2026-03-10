import { BaseExceptions } from "./BaseException";

export class EmailAlreadyRegisteredException extends BaseExceptions {
  constructor() {
    super("email_already_registered", "This email is already registered.", 409);
  }
}
