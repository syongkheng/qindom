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
exports.HdbService = void 0;
const node_html_parser_1 = require("node-html-parser");
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
const Coordinate_service_1 = require("./Coordinate.service");
const InvalidRequestException_1 = require("../exceptions/InvalidRequestException");
const UnknownException_1 = require("../exceptions/UnknownException");
class HdbService {
    constructor(db) {
        this.db = db;
        this.coordinateService = new Coordinate_service_1.CoordinateService(db);
    }
    retrieveListOfPphs(batch) {
        return __awaiter(this, void 0, void 0, function* () {
            const currentBatch = batch || this.generateBatch();
            if (typeof currentBatch !== "string" || !/^\d{6}$/.test(currentBatch)) {
                LoggingUtilities_1.LoggingUtilities.service.error("HdbService.statistics", `Invalid batch format: ${currentBatch}`);
                throw new InvalidRequestException_1.InvalidRequestException("Invalid batch format. Expected 'YYYYMM'.");
            }
            // 1️⃣ Check if data exists in DB
            const existingRecords = yield this.db.find("tb_hdb_pphs", { batch: currentBatch }, {
                limit: 1,
                orderBy: "created_dt",
                orderDirection: "desc",
                columns: ["json_string", "batch", "created_dt"],
            });
            if (existingRecords.length > 0) {
                LoggingUtilities_1.LoggingUtilities.service.info("HdbService.statistics", `Found existing records for batch ${currentBatch} in database`);
                try {
                    const records = JSON.parse(existingRecords[0].json_string);
                    return { records, source: "database" };
                }
                catch (parseError) {
                    LoggingUtilities_1.LoggingUtilities.service.error("HdbService.statistics", "Failed to parse JSON from database");
                }
            }
            LoggingUtilities_1.LoggingUtilities.service.info("HdbService.statistics", `No existing records found for batch ${currentBatch}, fetching from HDB website...`);
            // 2️⃣ Fetch from HDB website using fetch()
            const url = "https://www.hdb.gov.sg/residential/renting-a-flat/renting-from-hdb/parenthood-provisional-housing-schemepphs/application-procedure/flats-available-for-application-";
            let html;
            try {
                const response = yield fetch(url, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
                    },
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} - ${response.statusText}`);
                }
                html = yield response.text();
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("HdbService.statistics", `Failed to fetch from HDB website: ${error.message}`);
                return { records: [], source: "error" };
            }
            // 3️⃣ Parse HTML response
            const root = (0, node_html_parser_1.parse)(html);
            const tables = root.querySelectorAll("table");
            if (tables.length === 0) {
                LoggingUtilities_1.LoggingUtilities.service.error("HdbService.statistics", "No tables found on the HDB page.");
                throw new UnknownException_1.UnknownException();
            }
            const pphsTable = tables[0];
            const records = this.parseTable(pphsTable);
            // 4️⃣ Store records into DB
            try {
                yield this.db.insert("tb_hdb_pphs", {
                    batch: currentBatch,
                    json_string: JSON.stringify(records),
                    created_dt: new Date().getTime(),
                    created_by: "SYSTEM",
                });
                LoggingUtilities_1.LoggingUtilities.service.info("HdbService.statistics", `Successfully stored ${records.length} records for batch ${currentBatch} in database`);
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("HdbService.statistics", `Failed to insert records into database: ${error.message}`);
            }
            return { records, source: "website" };
        });
    }
    retrieveListOfPphsWithCoordinates(batch) {
        return __awaiter(this, void 0, void 0, function* () {
            const { records, source } = yield this.retrieveListOfPphs(batch);
            const recordsWithCoordinates = yield Promise.all(records.map((record) => __awaiter(this, void 0, void 0, function* () {
                LoggingUtilities_1.LoggingUtilities.service.info("HdbService.retrieveListOfPphsWithCoordinates", `Fetching coordinates for address: ${record.address}`);
                const { formed_url, lat, lng } = yield this.coordinateService.getCoordinatesOfAddress(record.address);
                return Object.assign(Object.assign({}, record), { formedUrl: formed_url, lat,
                    lng });
            })));
            return { records: recordsWithCoordinates, source };
        });
    }
    retrieveBusstopWithinRadiusOfLatLng(lat, lng, radius) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.db.pphs.findBusStopsWithinRadiusOfLatLng(lat, lng, radius);
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    retrieveNearestMrtStationsOfLatLng(lat, lng, limit) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.db.pphs.findMrtStationsWithinRadiusOfLatLng(lat, lng, limit !== null && limit !== void 0 ? limit : 3);
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    parseTable(table) {
        var _a, _b, _c, _d, _e, _f;
        const allRows = table.querySelectorAll("tbody > tr");
        const rows = allRows.slice(2);
        const results = [];
        let currentTown = "";
        for (const row of rows) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 5)
                continue; // Skip malformed rows
            let addressCell;
            let twoCell;
            let threeCell;
            let fourCell;
            let expiryCell;
            if (cells.length === 6) {
                const townText = (_a = cells[0].textContent) === null || _a === void 0 ? void 0 : _a.trim();
                if (townText)
                    currentTown = townText;
                addressCell = cells[1];
                twoCell = cells[2];
                threeCell = cells[3];
                fourCell = cells[4];
                expiryCell = cells[5];
            }
            else {
                addressCell = cells[0];
                twoCell = cells[1];
                threeCell = cells[2];
                fourCell = cells[3];
                expiryCell = cells[4];
            }
            const record = {
                town: currentTown,
                address: ((_b = addressCell.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || "",
                flatTypes: {},
                siteExpiry: ((_c = expiryCell.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || "",
            };
            const t2 = (_d = twoCell.textContent) === null || _d === void 0 ? void 0 : _d.trim();
            const t3 = (_e = threeCell.textContent) === null || _e === void 0 ? void 0 : _e.trim();
            const t4 = (_f = fourCell.textContent) === null || _f === void 0 ? void 0 : _f.trim();
            if (t2 && t2 !== "-")
                record.flatTypes["2-room"] = t2;
            if (t3 && t3 !== "-")
                record.flatTypes["3-room"] = t3;
            if (t4 && t4 !== "-")
                record.flatTypes["4-room"] = t4;
            results.push(record);
        }
        return results;
    }
    generateBatch() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        return `${year}${month}`;
    }
    getAvailableBatches() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const batches = yield this.db.find("tb_hdb_pphs", {}, {
                    columns: ["batch"],
                    orderBy: "batch",
                    orderDirection: "desc",
                });
                return [...new Set(batches.map((b) => b.batch))];
            }
            catch (error) {
                console.error("Error fetching available batches:", error);
                return [];
            }
        });
    }
}
exports.HdbService = HdbService;
