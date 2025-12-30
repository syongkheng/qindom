"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidRequestException = void 0;
const BaseException_1 = require("./BaseException");
class InvalidRequestException extends BaseException_1.BaseExceptions {
    constructor(fieldName) {
        super(`invalid_request_${fieldName}`, fieldName ? `Invalid request: ${fieldName}` : "Invalid request", 400);
    }
}
exports.InvalidRequestException = InvalidRequestException;
