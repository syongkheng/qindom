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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LtaService = void 0;
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file
dotenv_1.default.config();
class LtaService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Makes a call to LTA DataMall to retrieve bus arrival timings for a specific bus stop code.
     * @param busStopCode
     * @returns Array of bus timing records and source of data
     */
    statistics(busStopCode) {
        return __awaiter(this, void 0, void 0, function* () {
            const apiKey = process.env.LTA_DATAMALL_API_KEY;
            if (!apiKey) {
                LoggingUtilities_1.LoggingUtilities.service.error("lta_service", "LTA_DATAMALL_API_KEY is not set in environment variables");
                throw new Error("LTA API key not configured");
            }
            try {
                LoggingUtilities_1.LoggingUtilities.service.debug("lta_service", `busStopCode: ${busStopCode}`);
                const response = yield fetch(`https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=${busStopCode}`, {
                    method: "GET",
                    headers: {
                        AccountKey: apiKey,
                        Accept: "application/json",
                    },
                });
                if (!response.ok) {
                    LoggingUtilities_1.LoggingUtilities.service.error("lta_service", `LTA API request failed with status ${response.status}`);
                    throw new Error(`LTA API request failed with status ${response.status}`);
                }
                const data = yield response.json();
                return {
                    records: data.Services,
                    source: "website",
                };
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("lta_service", `Error fetching LTA data: ${error.message}`);
            }
            throw new Error("Failed to fetch LTA data");
        });
    }
}
exports.LtaService = LtaService;
