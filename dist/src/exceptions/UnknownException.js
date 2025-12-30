"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnknownException = void 0;
const BaseException_1 = require("./BaseException");
class UnknownException extends BaseException_1.BaseExceptions {
    constructor() {
        super("unknown", "Something went wrong", 500);
    }
}
exports.UnknownException = UnknownException;
