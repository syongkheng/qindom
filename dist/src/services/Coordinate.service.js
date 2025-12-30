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
exports.CoordinateService = void 0;
const axios_1 = __importDefault(require("axios"));
const node_html_parser_1 = require("node-html-parser");
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
class CoordinateService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Makes a call to Google Maps to retrieve coordinates for a given address based on the redirection url.
     * @param address
     * @returns formed_url, lat, lng, and source of data
     */
    getCoordinatesOfAddress(address) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const transformedAddress = address.replace(/ /g, "+");
            // Check if we already have coordinates for this address in the database
            const existingRecords = yield this.db.find("tb_hdb_pphs_coordinate", { building: transformedAddress }, {
                limit: 1,
                orderBy: "created_dt",
                orderDirection: "desc",
                columns: ["formed_url", "lat", "lng"],
            });
            if (existingRecords.length > 0) {
                LoggingUtilities_1.LoggingUtilities.service.info("CoordinateService.getCoordinatesOfAddress", `Found existing coordinates for ${address} in database`);
                return {
                    formed_url: existingRecords[0].formed_url,
                    lat: existingRecords[0].lat,
                    lng: existingRecords[0].lng,
                    source: "database",
                };
            }
            this.sleep(1000); // Sleep for 1 second to avoid rapid requests
            const requestUrl = `https://www.google.com/maps/search/${transformedAddress}`;
            LoggingUtilities_1.LoggingUtilities.service.info("CoordinateService.getCoordinatesOfAddress", `[EXT-GET] ${requestUrl}`);
            // Make GET request to Google to retrieve redirect URL
            const response = yield axios_1.default
                .get(requestUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
                },
            })
                .catch((error) => {
                LoggingUtilities_1.LoggingUtilities.service.error("CoordinateService.getCoordinatesOfAddress", `Failed to fetch from Google for address: ${address} - ${error.message}`);
                return { data: "" }; // Return empty data on error
            });
            const root = (0, node_html_parser_1.parse)(response.data);
            const scripts = root.querySelectorAll("script");
            const urlRegex = /https?:\/\/www\.google\.com\/maps\/preview\/place\/[^"'\s\\]+/g;
            for (const script of scripts) {
                const scriptContent = script.text;
                const matches = scriptContent.match(urlRegex);
                if (matches && matches.length > 0) {
                    const url = matches[0].replace(/\\u003d/g, "=");
                    LoggingUtilities_1.LoggingUtilities.service.debug("CoordinateService.getCoordinatesOfAddress", `Formed: ${url}`);
                    const parts = (_a = url.split("/@")[1]) === null || _a === void 0 ? void 0 : _a.split(",");
                    const retrievedLat = parts ? parts[0] : "";
                    const retrievedLng = parts ? parts[1] : "";
                    try {
                        // Insert DB for future retrieval
                        yield this.db.insert("tb_hdb_pphs_coordinate", {
                            building: transformedAddress,
                            formed_url: url,
                            lat: retrievedLat,
                            lng: retrievedLng,
                            created_dt: new Date().getTime(),
                            created_by: "SYSTEM",
                        });
                        LoggingUtilities_1.LoggingUtilities.service.info("CoordinateService.getCoordinatesOfAddress", `Sucessfully stored coordinates for ${address} in database`);
                    }
                    catch (error) {
                        LoggingUtilities_1.LoggingUtilities.service.error("CoordinateService.getCoordinatesOfAddress", `Failed to store coordinates for ${address} in database`);
                    }
                    return {
                        formed_url: url,
                        lat: retrievedLat,
                        lng: retrievedLng,
                        source: "google",
                    };
                }
            }
            // Fallback response
            return { source: "error", formed_url: "", lat: "", lng: "" };
        });
    }
    sleep(ms) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => setTimeout(resolve, ms));
        });
    }
}
exports.CoordinateService = CoordinateService;
