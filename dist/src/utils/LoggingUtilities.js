"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggingUtilities = void 0;
class LoggingUtilities {
    constructor() { }
    static formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    }
}
exports.LoggingUtilities = LoggingUtilities;
LoggingUtilities.controller = class {
    static start(verb, path, message) {
        console.log(`[${LoggingUtilities.formatDate(new Date())}] [${verb}] [${path}] - [ENTR] - ${message}`);
    }
    static end(verb, path, message) {
        console.log(`[${LoggingUtilities.formatDate(new Date())}] [${verb}] [${path}] - [EXIT] - ${message}`);
    }
};
LoggingUtilities.service = class {
    static info(serviceName, message) {
        console.log(`[${LoggingUtilities.formatDate(new Date())}] [I] [${serviceName}] - ${message}`);
    }
    static warn(serviceName, message) {
        console.log(`[${LoggingUtilities.formatDate(new Date())}] [W] [${serviceName}] - ${message}`);
    }
    static debug(serviceName, message) {
        console.log(`[${LoggingUtilities.formatDate(new Date())}] [D] [${serviceName}] - ${message}`);
    }
    static error(serviceName, message) {
        console.log(`[${LoggingUtilities.formatDate(new Date())}] [E] [${serviceName}] - ${message}`);
    }
};
