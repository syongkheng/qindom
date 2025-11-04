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
exports.default = createLtaController;
// src/controllers/Lta.controller.ts
const express_1 = require("express");
const ControllerResponse_1 = require("../models/responses/ControllerResponse");
const Lta_service_1 = require("../services/Lta.service");
function createLtaController(db) {
    const router = (0, express_1.Router)();
    const ltaService = new Lta_service_1.LtaService(db);
    /**
     * Gets bus arrival timings for a specific bus stop code.
     * @route GET /lta/timing?busStopCode={busStopCode}
     * @param {string} busStopCode.query.required - The bus stop code to retrieve timings for
     * @returns {ControllerResponse} 200 - An array of bus arrival timings
     * @returns {ControllerResponse} 400 - Bad request, missing or invalid parameters
     * @returns {ControllerResponse} 500 - Internal server error
     */
    router.get("/timing", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const { busStopCode } = req.query;
            if (!busStopCode) {
                return response.ko("[busStopCode] is required");
            }
            const result = yield ltaService.statistics(busStopCode);
            return response.ok(result);
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    return router;
}
