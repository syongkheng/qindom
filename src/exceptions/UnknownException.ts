import { BaseExceptions } from "./BaseException.js";

export class UnknownException extends BaseExceptions {
  constructor() {
    super("unknown", "Something went wrong", 500);
  }
}
