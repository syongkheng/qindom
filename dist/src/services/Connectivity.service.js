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
exports.ConnectivityService = void 0;
/**
 * Service to handle connectivity checks.
 */
class ConnectivityService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Simple JSON message to indicate server status.
     * @returns status, message, and timestamp of server
     */
    statistics() {
        return __awaiter(this, void 0, void 0, function* () {
            // Simple query to check database connectivity
            return {
                status: "ok",
                message: "Server is connected",
                timestamp: new Date().toISOString(),
            };
        });
    }
}
exports.ConnectivityService = ConnectivityService;
