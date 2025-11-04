"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistrationException = void 0;
const BaseException_1 = require("./BaseException");
class RegistrationException extends BaseException_1.BaseExceptions {
    constructor() {
        super("registration_failed", "Something went wrong during registration.", 500);
    }
}
exports.RegistrationException = RegistrationException;
