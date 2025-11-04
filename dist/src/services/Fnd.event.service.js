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
exports.FndEventService = void 0;
const UnknownException_1 = require("../exceptions/UnknownException");
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
class FndEventService {
    constructor(db) {
        this.db = db;
    }
    /**
     * 🟢 READ: Retrieve all active events
     */
    getAllEvent() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                LoggingUtilities_1.LoggingUtilities.service.info("FndEventService.getAllEvent", "Fetching all active events with view counts");
                const existingRecords = yield this.db.find("tb_fnd_event", { record_status: "A" }, {
                    orderBy: "created_dt",
                    orderDirection: "desc",
                    extraWhere: (qb) => {
                        qb.andWhere("event_dt", ">=", Math.floor(new Date().getTime()) / 1000);
                    },
                });
                const eventsWithViewCount = yield Promise.all(existingRecords.map((event) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    const views = yield this.getEventViews(event.id);
                    return Object.assign(Object.assign({}, event), { view_count: (_a = views === null || views === void 0 ? void 0 : views.count) !== null && _a !== void 0 ? _a : -1 });
                })));
                return eventsWithViewCount;
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("FndEventService.getAllEvent", `Something went wrong: ${error}`);
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    /**
     * 🟡 CREATE: Add a new event
     */
    createEvent(_a) {
        return __awaiter(this, arguments, void 0, function* ({ eventDt, title, content, createdBy, }) {
            try {
                return yield this.db.insert("tb_fnd_event", {
                    event_dt: eventDt,
                    title: title,
                    content: content,
                    record_status: "A",
                    created_dt: new Date().getTime(),
                    created_by: createdBy,
                });
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    /**
     * 🟠 UPDATE: Modify an existing event
     */
    updateEvent(_a) {
        return __awaiter(this, arguments, void 0, function* ({ id, eventDt, title, content, updatedBy, }) {
            try {
                if (!id)
                    throw new UnknownException_1.UnknownException();
                return yield this.db.update("tb_fnd_event", { id: id }, {
                    event_dt: eventDt,
                    title: title,
                    content: content,
                    updated_dt: new Date().getTime(),
                    updated_by: updatedBy,
                });
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.updateNotice", `Something went wrong: ${error}`);
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    /**
     * 🔴 DELETE: Soft delete (mark as deleted)
     */
    deleteEvent(id, updatedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.db.update("tb_fnd_event", { id }, {
                    record_status: "D",
                    updated_dt: new Date().getTime(),
                    updated_by: updatedBy !== null && updatedBy !== void 0 ? updatedBy : "UNKNOWN",
                });
                if (result.length === 0) {
                    throw new UnknownException_1.UnknownException();
                }
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    viewEvent(id, username) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const isViewed = yield this.db.findOne("tb_fnd_event_view", {
                    event_id: id,
                    username: username,
                });
                if (isViewed) {
                    return isViewed;
                }
                return yield this.db.insert("tb_fnd_event_view", {
                    event_id: id,
                    username: username,
                    created_dt: new Date().getTime(),
                });
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    getEventViews(eventId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield this.db.find("tb_fnd_event_view", {
                    event_id: eventId,
                });
                return { count: res.length };
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
}
exports.FndEventService = FndEventService;
