import { BaseExceptions } from "./BaseException";

export class TokenFormatException extends BaseExceptions {
  constructor() {
    super("token_format", "The provided token is not in the correct format.", 400);
  }
}