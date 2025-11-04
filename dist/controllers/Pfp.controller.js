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
exports.default = createPfpController;
// src/controllers/Hdb.controller.ts
const express_1 = require("express");
const ControllerResponse_1 = require("../models/responses/ControllerResponse");
const Pfp_service_1 = require("../services/Pfp.service");
const TokenFilter_1 = require("../middlewares/TokenFilter");
function createPfpController(db) {
    const router = (0, express_1.Router)();
    const pfpService = new Pfp_service_1.PfpService(db);
    router.get("/user/country", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const system = (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c.system) !== null && _d !== void 0 ? _d : "UNKNOWN";
            return response.ok(yield pfpService.getCountry(`${username}_${system}`));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/user/country", [TokenFilter_1.MandatoryTokenFilter], (_req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = _req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { country, system } = _req.body;
            const result = yield pfpService.updateCountry(`${username}_${system}`, country);
            return response.ok(result);
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.get("/user/photo", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const system = (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c.system) !== null && _d !== void 0 ? _d : "UNKNOWN";
            const userRecord = yield pfpService.getProfilePhoto(`${username}_${system}`);
            return response.ok(userRecord);
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/user/photo", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const system = (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c.system) !== null && _d !== void 0 ? _d : "UNKNOWN";
            const { blobString } = req.body;
            return response.ok(yield pfpService.updateProfilePhoto(`${username}_${system}`, blobString));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    return router;
}
