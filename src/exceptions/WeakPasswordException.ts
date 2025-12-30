import { BaseExceptions } from "./BaseException";

export class WeakPasswordException extends BaseExceptions {
  constructor() {
    super("weak_password", "The provided password is too weak.", 400);
  }
}
