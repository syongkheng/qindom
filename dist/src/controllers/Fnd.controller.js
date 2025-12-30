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
exports.default = createFndController;
// src/controllers/Fnd.controller.ts
const express_1 = require("express");
const ControllerResponse_1 = require("../models/responses/ControllerResponse");
const Fnd_notice_service_1 = require("../services/Fnd.notice.service");
const TokenFilter_1 = require("../middlewares/TokenFilter");
const Fnd_event_service_1 = require("../services/Fnd.event.service");
const Token_service_1 = require("../services/Token.service");
function createFndController(db) {
    const noticeService = new Fnd_notice_service_1.FndNoticeService(db);
    const eventService = new Fnd_event_service_1.FndEventService(db);
    const tokenService = new Token_service_1.TokenService(db);
    const router = (0, express_1.Router)();
    //  ---- Notices ----
    router.get("/notices", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            if (req.headers["authorization"] &&
                typeof req.headers["authorization"] === "string") {
                const token = req.headers["authorization"].replace("Bearer ", "");
                const userClassification = (yield tokenService.decodeToken(token)).role;
                return response.ok(yield noticeService.getAllNotice(userClassification));
            }
            return response.ok(yield noticeService.getAllNotice("OPEN"));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/notices/create", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const requestUsername = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { type, title, content, classification } = req.body;
            return response.ok(yield noticeService.createNotice({
                type,
                title,
                content,
                classification,
                createdBy: requestUsername,
            }));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/notices/update", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const requestUsername = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { id, type, title, content, classification } = req.body;
            return response.ok(yield noticeService.updateNotice({
                id,
                type,
                title,
                content,
                classification,
                updatedBy: requestUsername,
            }));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/notices/delete", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { id } = req.body;
            return response.ok(yield noticeService.deleteNotice(id, username));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/notices/view", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { id } = req.body;
            return response.ok(yield noticeService.viewNotice(id, username));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    // ---- Events ----
    router.get("/events", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            return response.ok(yield eventService.getAllEvent());
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/events/create", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const requestUsername = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { event_dt, title, content } = req.body;
            return response.ok(yield eventService.createEvent({
                eventDt: event_dt,
                title,
                content,
                createdBy: requestUsername,
            }));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/events/update", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const requestUsername = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { id, event_dt, title, content } = req.body;
            return response.ok(yield eventService.updateEvent({
                id,
                eventDt: event_dt,
                title,
                content,
                updatedBy: requestUsername,
            }));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/events/delete", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const requestUsername = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { id } = req.body;
            return response.ok(yield eventService.deleteEvent(id, requestUsername));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/events/view", [TokenFilter_1.MandatoryTokenFilter], (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const username = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : "UNKNOWN";
            const { id } = req.body;
            return response.ok(yield eventService.viewEvent(id, username));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    return router;
}
