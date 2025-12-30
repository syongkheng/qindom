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
exports.FndNoticeService = void 0;
const AppExceptions_1 = require("../exceptions/AppExceptions");
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
class FndNoticeService {
    constructor(db) {
        this.db = db;
    }
    /**
     * 🟢 READ: Retrieve all active notices
     */
    getAllNotice(classification) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                LoggingUtilities_1.LoggingUtilities.service.info("FndNoticeService.getAllNotice", `Fetching all active notices with view counts for classification: ${classification}`);
                // Define hierarchy
                const hierarchy = ["OPEN", "R1", "R2", "R3", "R4"];
                // Determine which classifications to include
                let allowedClassifications;
                if (classification === "OPEN") {
                    allowedClassifications = ["OPEN"];
                }
                else {
                    const index = hierarchy.indexOf(classification);
                    allowedClassifications = hierarchy.slice(0, index + 1);
                }
                // Retrieve matching records
                const existingRecords = yield this.db.find("tb_fnd_notice", { record_status: "A" }, {
                    orderBy: "created_dt",
                    orderDirection: "desc",
                });
                // Filter by allowed classifications
                const filteredRecords = existingRecords.filter((notice) => { var _a; return allowedClassifications.includes((_a = notice.classification) !== null && _a !== void 0 ? _a : ""); });
                // Attach view counts
                const noticesWithViewCount = yield Promise.all(filteredRecords.map((notice) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    const views = yield this.getNoticeViews(notice.id);
                    return Object.assign(Object.assign({}, notice), { view_count: (_a = views === null || views === void 0 ? void 0 : views.count) !== null && _a !== void 0 ? _a : -1 });
                })));
                return noticesWithViewCount;
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.getAllNotice", `Something went wrong: ${error}`);
                throw new AppExceptions_1.Exceptions.Unknown();
            }
        });
    }
    /**
     * 🟡 CREATE: Add a new notice
     */
    createNotice(_a) {
        return __awaiter(this, arguments, void 0, function* ({ type, title, content, classification, createdBy, }) {
            try {
                LoggingUtilities_1.LoggingUtilities.service.info("FndNoticeService.createNotice", `Creating notice with title: ${title}`);
                return yield this.db.insert("tb_fnd_notice", {
                    type: type,
                    title: title,
                    content: content,
                    classification: classification,
                    record_status: "A",
                    created_dt: new Date().getTime(),
                    created_by: createdBy,
                });
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.createNotice", `Something went wrong: ${error}`);
                throw new AppExceptions_1.Exceptions.EntityCreation("ITB_FND_NOTICE");
            }
        });
    }
    /**
     * 🟠 UPDATE: Modify an existing notice
     */
    updateNotice(_a) {
        return __awaiter(this, arguments, void 0, function* ({ id, type, title, content, classification, updatedBy, }) {
            try {
                LoggingUtilities_1.LoggingUtilities.service.info("FndNoticeService.updateNotice", `Updating notice with ID: ${id}`);
                if (!id) {
                    LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.updateNotice", `Invalid ID provided: ${id}`);
                    throw new AppExceptions_1.Exceptions.InvalidRequest("id");
                }
                return yield this.db.update("tb_fnd_notice", { id: id }, {
                    type: type,
                    title: title,
                    content: content,
                    classification: classification,
                    updated_dt: new Date().getTime(),
                    updated_by: updatedBy,
                });
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.updateNotice", `Something went wrong: ${error}`);
                throw new AppExceptions_1.Exceptions.EntityUpdate("ITB_FND_NOTICE");
            }
        });
    }
    /**
     * 🔴 DELETE: Soft delete (mark as deleted)
     */
    deleteNotice(id, updatedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                LoggingUtilities_1.LoggingUtilities.service.info("FndNoticeService.deleteNotice", `Deleting notice with ID: ${id}`);
                const result = yield this.db.update("tb_fnd_notice", { id }, {
                    record_status: "D",
                    updated_dt: new Date().getTime(),
                    updated_by: updatedBy !== null && updatedBy !== void 0 ? updatedBy : "UNKNOWN",
                });
                if (result.length === 0) {
                    LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.deleteNotice", `No notice found with ID: ${id} to delete`);
                    throw new AppExceptions_1.Exceptions.EntityUpdate("ITB_FND_NOTICE");
                }
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.deleteNotice", `Something went wrong: ${error}`);
                throw new AppExceptions_1.Exceptions.EntityUpdate("ITB_FND_NOTICE");
            }
        });
    }
    viewNotice(id, username) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const isViewed = yield this.db.findOne("tb_fnd_notice_view", {
                    notice_id: id,
                    username: username,
                });
                if (isViewed) {
                    LoggingUtilities_1.LoggingUtilities.service.info("FndNoticeService.viewNotice", `Notice ID: ${id} already viewed by user: ${username}`);
                    return isViewed;
                }
                LoggingUtilities_1.LoggingUtilities.service.info("FndNoticeService.viewNotice", `Recording view for notice ID: ${id} by user: ${username}`);
                return yield this.db.insert("tb_fnd_notice_view", {
                    notice_id: id,
                    username: username,
                    created_dt: new Date().getTime(),
                });
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.viewNotice", `Something went wrong: ${error}`);
                throw new AppExceptions_1.Exceptions.EntityCreation("ITB_FND_NOTICE_VIEW");
            }
        });
    }
    getNoticeViews(noticeId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                LoggingUtilities_1.LoggingUtilities.service.info("FndNoticeService.getNoticeViews", `Fetching view count for notice ID: ${noticeId}`);
                const res = yield this.db.find("tb_fnd_notice_view", { notice_id: noticeId });
                return { count: res.length };
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("FndNoticeService.getNoticeViews", `Something went wrong: ${error}`);
                throw new AppExceptions_1.Exceptions.EntityRetrieval();
            }
        });
    }
}
exports.FndNoticeService = FndNoticeService;
