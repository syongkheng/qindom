import { BaseExceptions } from "./BaseException.js";

export class WeakPasswordException extends BaseExceptions {
  constructor() {
    super("weak_password", "The provided password is too weak.", 400);
  }
}
