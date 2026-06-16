import { BaseExceptions } from "./BaseException.js";

export class TokenFormatException extends BaseExceptions {
  constructor() {
    super("token_format", "The provided token is not in the correct format.", 400);
  }
}