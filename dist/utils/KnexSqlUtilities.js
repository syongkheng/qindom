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
const LoggingUtilities_1 = require("./LoggingUtilities");
class KnexSqlUtilities {
    constructor(knex) {
        this.knex = knex;
        this.pphs = {
            findBusStopsWithinRadiusOfLatLng: this._findBusStopsWithinRadiusOfLatLng.bind(this),
        };
        this.lta = {
            findBusServicesByBusStopCode: this._findBusServicesByBusStopCode.bind(this),
        };
    }
    // CREATE
    insert(table, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const query = this.knex(table).insert(data);
                const [id] = yield query;
                // Fetch the inserted row manually if needed
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.find", `Executing query - [ ${query.toQuery()} ]`);
                const [row] = yield this.knex(table).where({ id }).select("*");
                return row;
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.insert", `Insert error: ${error.message}`);
                throw new Error(`Insert failed: ${error.message}`);
            }
        });
    }
    // READ - Single record
    findOne(table_1) {
        return __awaiter(this, arguments, void 0, function* (table, whereClause = {}, columns = ["*"]) {
            try {
                const query = this.knex(table).select(columns).where(whereClause).first();
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.findOne", `Executing query - [ ${query.toQuery()} ]`);
                return (yield query);
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.findOne", `Find one error: ${error.message}`);
                throw new Error(`Find one failed: ${error.message}`);
            }
        });
    }
    // READ - Multiple records
    find(table_1) {
        return __awaiter(this, arguments, void 0, function* (table, whereClause = {}, options = {}) {
            try {
                let query = this.knex(table).where(whereClause);
                // Apply additional complex conditions if provided
                if (options.extraWhere) {
                    options.extraWhere(query);
                }
                if (options.limit)
                    query = query.limit(options.limit);
                if (options.offset)
                    query = query.offset(options.offset);
                if (options.orderBy)
                    query = query.orderBy(options.orderBy, options.orderDirection || "asc");
                query = options.columns
                    ? query.select(options.columns)
                    : query.select("*");
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.find", `Executing query - [ ${query.toQuery()} ]`);
                return (yield query);
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.find", `Find error: ${error.message}`);
                throw new Error(`Find failed: ${error.message}`);
            }
        });
    }
    // UPDATE
    update(table, whereClause, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const query = this.knex(table).where(whereClause).update(data);
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.update", `Executing query - [ ${query.toQuery()} ]`);
                yield query;
                const rows = yield this.knex(table).where(whereClause).select("*");
                return rows;
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.update", `Update error: ${error.message}`);
                throw new Error(`Update failed: ${error.message}`);
            }
        });
    }
    // DELETE
    delete(table, whereClause) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const query = this.knex(table).where(whereClause).delete();
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.delete", `Executing query - [ ${query.toQuery()} ]`);
                const result = yield query;
                return result; // returns number of deleted rows
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.delete", `Delete error: ${error.message}`);
                throw new Error(`Delete failed: ${error.message}`);
            }
        });
    }
    // RAW
    raw(sql_1) {
        return __awaiter(this, arguments, void 0, function* (sql, bindings = []) {
            try {
                const query = this.knex.raw(sql, bindings);
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.raw", `Executing raw query - [ ${query.toQuery()} ]`);
                const [rows] = yield query;
                return rows;
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.raw", `Raw query error: ${error.message}`);
                throw new Error(`Raw query failed: ${error.message}`);
            }
        });
    }
    // COUNT
    count(table_1) {
        return __awaiter(this, arguments, void 0, function* (table, whereClause = {}) {
            var _a;
            try {
                const query = this.knex(table)
                    .where(whereClause)
                    .count({ count: "*" });
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.count", `Executing query - [ ${query.toQuery()} ]`);
                const result = yield query;
                return Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.count", `Count error: ${error.message}`);
                throw new Error(`Count failed: ${error.message}`);
            }
        });
    }
    transaction(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.transaction", `Starting transaction`);
                const result = yield this.knex.transaction((trx) => __awaiter(this, void 0, void 0, function* () {
                    const output = yield callback(trx);
                    return output;
                }));
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.transaction", `Transaction committed successfully`);
                return result;
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.transaction", `Transaction failed: ${error.message}`);
                throw new Error(`Transaction failed: ${error.message}`);
            }
        });
    }
    _findBusStopsWithinRadiusOfLatLng(pphsLat, pphsLng, radiusInMeters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sql = `
      SELECT 
        b.busstop_code,
        b.road_name,
        b.desc,
        b.lat,
        b.lng,
        ST_Distance_Sphere(POINT(b.lng, b.lat), POINT(?, ?)) AS distance_m
      FROM tb_lta_busstop b
      WHERE ST_Distance_Sphere(POINT(b.lng, b.lat), POINT(?, ?)) <= ?
      ORDER BY distance_m ASC
    `;
                const bindings = [pphsLng, pphsLat, pphsLng, pphsLat, radiusInMeters];
                const query = this.knex.raw(sql, bindings);
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.lta.findBusStopsWithinRadius", `Executing raw query - [ ${query.toQuery()} ]`);
                const [rows] = yield query;
                // ✅ Normalize and count
                const allRows = rows;
                const count = allRows.length;
                const resultRows = allRows.slice(0, 10);
                return { rows: resultRows, count };
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.lta.findBusStopsWithinRadius", `Query error: ${error.message}`);
                throw new Error(`Failed to find nearby bus stops: ${error.message}`);
            }
        });
    }
    _findBusServicesByBusStopCode(busstopCode) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sql = `
      SELECT 
        service_no,
        operator,
        direction,
        stop_sequence,
        distance,
        wd_first_bus,
        wd_last_bus,
        sat_first_bus,
        sat_last_bus,
        sun_first_bus,
        sun_last_bus
      FROM tb_lta_bus_info
      WHERE busstop_code = ?
      ORDER BY CAST(service_no AS UNSIGNED), service_no
    `;
                const bindings = [busstopCode];
                const query = this.knex.raw(sql, bindings);
                LoggingUtilities_1.LoggingUtilities.service.debug("KnexSqlUtilities.lta.findBusServicesByBusStopCode", `Executing raw query - [ ${query.toQuery()} ]`);
                const [rows] = yield query;
                const allRows = rows;
                const count = allRows.length;
                const resultRows = allRows;
                return { rows: resultRows, count };
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("KnexSqlUtilities.lta.findBusServicesByBusStopCode", `Query error: ${error.message}`);
                throw new Error(`Failed to find bus services: ${error.message}`);
            }
        });
    }
}
exports.default = KnexSqlUtilities;
