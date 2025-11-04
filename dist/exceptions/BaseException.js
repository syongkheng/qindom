"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseExceptions = void 0;
class BaseExceptions extends Error {
    constructor(code, clientMessage, httpStatus = 400) {
        super(clientMessage);
        this.code = code;
        this.clientMessage = clientMessage;
        this.httpStatus = httpStatus;
        this.name = this.constructor.name;
        this.timestamp = Date.now();
        Error.captureStackTrace(this, this.constructor);
    }
    toResponseMessage() {
        return {
            code: this.code,
            message: this.message,
            timestamp: this.timestamp,
        };
    }
}
exports.BaseExceptions = BaseExceptions;
