"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createAuthController;
const express_1 = require("express");
const ControllerResponse_1 = require("../models/responses/ControllerResponse");
const Auth_service_1 = require("../services/Auth.service");
const BaseException_1 = require("../exceptions/BaseException");
const TokenFilter_1 = require("../middlewares/TokenFilter");
function createAuthController(db) {
    const router = (0, express_1.Router)();
    const authService = new Auth_service_1.AuthService(db);
    /**
     * Step to determine whether identity exists and to proceed to register or to login
     */
    router.post("/preflight", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const { username, system } = req.body;
            if (!username || typeof username !== "string") {
                response.badRequest("Invalid field - [username]");
            }
            if (!system || typeof system !== "string" || system !== "fnd") {
                response.badRequest("Invalid field - [system]");
            }
            const result = yield authService.checkIfUsernameExistsWithinSystem({
                username,
                system,
            });
            return response.ok(result);
        }
        catch (error) {
            if (error instanceof BaseException_1.BaseExceptions) {
                return response.result(error.httpStatus, error.message, error.toResponseMessage());
            }
            return response.ko(error.message);
        }
    }));
    router.post("/login", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const { username, password, system } = req.body;
            if (!username || typeof username !== "string") {
                response.badRequest("Invalid field - [username]");
            }
            if (!password || typeof password !== "string") {
                response.badRequest("Invalid field - [password]");
            }
            if (!system || typeof system !== "string" || system !== "fnd") {
                response.badRequest("Invalid field - [system]");
            }
            const result = yield authService.login({ username, password, system });
            return response.ok(result);
        }
        catch (error) {
            if (error instanceof BaseException_1.BaseExceptions) {
                return response.result(error.httpStatus, error.message, error.toResponseMessage());
            }
            return response.ko(error.message);
        }
    }));
    router.post("/register", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const { username, password, system, role } = req.body;
            if (!username || typeof username !== "string") {
                response.badRequest("Invalid field - [username]");
            }
            if (!password || typeof password !== "string") {
                response.badRequest("Invalid field - [password]");
            }
            if (!system || typeof system !== "string" || system !== "fnd") {
                response.badRequest("Invalid field - [system]");
            }
            if (!role || typeof role !== "string") {
                response.badRequest("Invalid field - [role]");
            }
            const result = yield authService.createNewUser({
                username,
                password,
                system,
                role,
            });
            return response.ok(result);
        }
        catch (error) {
            if (error instanceof BaseException_1.BaseExceptions) {
                return response.result(error.httpStatus, error.message, error.toResponseMessage());
            }
            return response.ko(error.message);
        }
    }));
    router.post("/verification", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const { token } = req.body;
            const result = yield authService.authenticateToken(token);
            return response.ok(result);
        }
        catch (error) {
            if (error instanceof BaseException_1.BaseExceptions) {
                return response.result(error.httpStatus, error.message, error.toResponseMessage());
            }
            return response.ko(error.message);
        }
    }));
    router.post("/password/validate", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const system = (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c.system) !== null && _d !== void 0 ? _d : "UNKNOWN";
            const { password } = req.body;
            const result = yield authService.validatePassword(`${username}_${system}`, password);
            return response.ok(result);
        }
        catch (error) {
            if (error instanceof BaseException_1.BaseExceptions) {
                return response.result(error.httpStatus, error.message, error.toResponseMessage());
            }
            return response.ko(error.message);
        }
    }));
    router.post("/password/update", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const system = (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c.system) !== null && _d !== void 0 ? _d : "UNKNOWN";
            const { newPassword } = req.body;
            const result = yield authService.updatePassword(`${username}_${system}`, newPassword);
            return response.ok(result);
        }
        catch (error) {
            if (error instanceof BaseException_1.BaseExceptions) {
                return response.result(error.httpStatus, error.message, error.toResponseMessage());
            }
            return response.ko(error.message);
        }
    }));
    return router;
}
