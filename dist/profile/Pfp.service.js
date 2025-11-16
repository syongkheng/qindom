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
exports.PfpService = void 0;
const UnknownException_1 = require("../exceptions/UnknownException");
/**
 * Service to handle connectivity checks.
 */
class PfpService {
    constructor(db) {
        this.db = db;
    }
    getCountry(username_system) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userRecord = yield this.db.findOne("tb_aa_user", {
                    username_system,
                    record_status: "A",
                });
                return { country: (userRecord === null || userRecord === void 0 ? void 0 : userRecord.country) || null };
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    updateCountry(username_system, country) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const updatedUser = yield this.db.update("tb_aa_user", { username_system, record_status: "A" }, { country });
                return updatedUser.map((user) => (Object.assign(Object.assign({}, user), { password: "[REDACTED]", token: "[REDACTED]" })));
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    updateProfilePhoto(username_system, photoUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const updatedUser = yield this.db.update("tb_aa_user", { username_system, record_status: "A" }, { pfp_picture_blob: photoUrl });
                return updatedUser.map((user) => (Object.assign(Object.assign({}, user), { password: "[REDACTED]", token: "[REDACTED]" })));
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
    getProfilePhoto(username_system) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userRecord = yield this.db.findOne("tb_aa_user", {
                    username_system,
                    record_status: "A",
                });
                const base64String = Buffer.from(userRecord.pfp_picture_blob).toString("base64");
                const blobString = atob(base64String);
                return { blobString: blobString || null };
            }
            catch (error) {
                throw new UnknownException_1.UnknownException();
            }
        });
    }
}
exports.PfpService = PfpService;
