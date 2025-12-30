"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestRequestLogger = void 0;
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
const RestRequestLogger = function (req, res, next) {
    const sanitisedMessage = (message) => {
        // Simple sanitization to avoid logging sensitive info like passwords
        return message.replace(/"password"\s*:\s*".*?"/gi, '"password":"[REDACTED]"');
    };
    if (req.method === "GET") {
        LoggingUtilities_1.LoggingUtilities.controller.start(req.method, req.originalUrl, JSON.stringify(req.query));
    }
    else {
        LoggingUtilities_1.LoggingUtilities.controller.start(req.method, req.originalUrl, sanitisedMessage(JSON.stringify(req.body)));
    }
    next();
};
exports.RestRequestLogger = RestRequestLogger;
