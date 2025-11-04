
import { BaseExceptions } from "./BaseException";

export class RegistrationException extends BaseExceptions {
  constructor() {
    super("registration_failed", "Something went wrong during registration.", 500);
  }
}