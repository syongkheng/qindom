import { BaseExceptions } from "./BaseException";

export class TokenExpiredException extends BaseExceptions {
  constructor() {
    super("token_expired", "The provided token has expired.", 401);
  }
}