"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidLoginCredentialsException = void 0;
const BaseException_1 = require("./BaseException");
class InvalidLoginCredentialsException extends BaseException_1.BaseExceptions {
    constructor() {
        super("invalid_login_credentials", "Invalid login credentials", 401);
    }
}
exports.InvalidLoginCredentialsException = InvalidLoginCredentialsException;
