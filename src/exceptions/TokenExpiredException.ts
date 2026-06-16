import { BaseExceptions } from "./BaseException.js";

export class TokenExpiredException extends BaseExceptions {
  constructor() {
    super("token_expired", "The provided token has expired.", 401);
  }
}