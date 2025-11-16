"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalRequestException = void 0;
const BaseException_1 = require("./BaseException");
class ExternalRequestException extends BaseException_1.BaseExceptions {
    constructor(externalService) {
        super("external_request_exception", `Something went wrong calling external service: ${externalService}`, 400);
    }
}
exports.ExternalRequestException = ExternalRequestException;
