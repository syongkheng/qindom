"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenFormatException = void 0;
const BaseException_1 = require("./BaseException");
class TokenFormatException extends BaseException_1.BaseExceptions {
    constructor() {
        super("token_format", "The provided token is not in the correct format.", 400);
    }
}
exports.TokenFormatException = TokenFormatException;
