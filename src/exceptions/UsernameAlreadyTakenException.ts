import { BaseExceptions } from "./BaseException";

export class UsernameAlreadyTakenException extends BaseExceptions {
  constructor() {
    super("username_already_taken", "This username is already taken.", 409);
  }
}
