import { BaseExceptions } from "./BaseException";

export class UnknownException extends BaseExceptions {
  constructor() {
    super("unknown", "Something went wrong", 500);
  }
}
