"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenFilter = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
const ControllerResponse_1 = require("../models/responses/ControllerResponse");
const TokenFilter = function (req, res, next) {
    const response = new ControllerResponse_1.ControllerResponse(res);
    const jwtSecret = process.env.JWT_SECRET;
    try {
        const authHeader = req.headers["authorization"];
        if (!authHeader) {
            LoggingUtilities_1.LoggingUtilities.service.error("TokenFilter", "Missing Header - Authorization");
            return response.badRequest("Invalid Header - Authorization");
        }
        const token = authHeader.split(" ")[1];
        if (!token) {
            LoggingUtilities_1.LoggingUtilities.service.error("TokenFilter", "Invalid Format - Authorization");
            return response.badRequest("Invalid Format - Authorization");
        }
        if (!jwtSecret) {
            LoggingUtilities_1.LoggingUtilities.service.error("TokenFilter", "No JWT_SECRET found");
            return response.ko("Something went wrong decoding Jwt");
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        req.user = decoded;
        next();
    }
    catch (error) {
        LoggingUtilities_1.LoggingUtilities.service.error("TokenFilter", `Invalid token : ${error}`);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
exports.TokenFilter = TokenFilter;
