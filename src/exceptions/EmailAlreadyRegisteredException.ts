import { BaseExceptions } from "./BaseException.js";

export class EmailAlreadyRegisteredException extends BaseExceptions {
  constructor() {
    super("email_already_registered", "This email is already registered.", 409);
  }
}
