"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenExpiredException = void 0;
const BaseException_1 = require("./BaseException");
class TokenExpiredException extends BaseException_1.BaseExceptions {
    constructor() {
        super("token_expired", "The provided token has expired.", 401);
    }
}
exports.TokenExpiredException = TokenExpiredException;
