"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControllerResponse = void 0;
const LoggingUtilities_1 = require("../../utils/LoggingUtilities");
class ControllerResponse {
    constructor(expressResponse) {
        this.res = expressResponse;
        this.httpMethod = expressResponse.req.method;
        this.pathName = expressResponse.req.originalUrl;
    }
    ok(data) {
        const responseBody = {
            code: 200,
            status: "Ok",
            data: data,
        };
        LoggingUtilities_1.LoggingUtilities.controller.end(this.httpMethod, this.pathName, JSON.stringify(responseBody));
        return this.res.status(200).json(responseBody);
    }
    ko(data) {
        const responseBody = {
            code: 500,
            status: "Ko",
            data: data,
        };
        LoggingUtilities_1.LoggingUtilities.controller.end(this.httpMethod, this.pathName, JSON.stringify(responseBody));
        return this.res.status(500).json(responseBody);
    }
    badRequest(data) {
        const responseBody = {
            code: 400,
            status: "Ko",
            data: data,
        };
        LoggingUtilities_1.LoggingUtilities.controller.end(this.httpMethod, this.pathName, JSON.stringify(responseBody));
        return this.res.status(400).json(responseBody);
    }
    result(statusCode, message, data) {
        const responseBody = {
            code: statusCode,
            status: message,
            data: data,
        };
        LoggingUtilities_1.LoggingUtilities.controller.end(this.httpMethod, this.pathName, JSON.stringify(responseBody));
        return this.res.status(statusCode).json(responseBody);
    }
}
exports.ControllerResponse = ControllerResponse;
