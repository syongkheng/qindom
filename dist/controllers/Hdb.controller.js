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
exports.default = createHdbController;
// src/controllers/Hdb.controller.ts
const express_1 = require("express");
const ControllerResponse_1 = require("../models/responses/ControllerResponse");
const Hdb_service_1 = require("../services/Hdb.service");
function createHdbController(db) {
    const router = (0, express_1.Router)();
    const hdbService = new Hdb_service_1.HdbService(db);
    /**
     * Gets a list of PPHS with coordinates, based on the current MMYYYY.
     * @route GET /hdb
     * @returns {ControllerResponse} 200 - An array of PPHS with coordinates
     * @returns {ControllerResponse} 500 - Internal server error
     */
    router.post("/pphs", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const { batch } = req.body;
            const result = yield hdbService.retrieveListOfPphsWithCoordinates(batch);
            return response.ok(result);
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    router.post("/pphs/busstops", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const response = new ControllerResponse_1.ControllerResponse(res);
        try {
            const { lat, lng, radius } = req.body;
            return response.ok(yield hdbService.retrieveBusstopWithinRadiusOfLatLng(lat, lng, radius));
        }
        catch (error) {
            return response.ko(error.message);
        }
    }));
    return router;
}
