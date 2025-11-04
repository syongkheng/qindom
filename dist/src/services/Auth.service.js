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
exports.AuthService = void 0;
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
const bcrypt_1 = __importDefault(require("bcrypt"));
const Token_service_1 = require("./Token.service");
const UnknownException_1 = require("../exceptions/UnknownException");
/**
 * Service to handle Authentications.
 */
class AuthService {
    constructor(db) {
        this.db = db;
        this.tokenService = new Token_service_1.TokenService(db);
    }
    /**
     * Checks if username and system exists
     * @param username
     * @param system
     * @returns
     */
    checkIfUsernameExistsWithinSystem(_a) {
        return __awaiter(this, arguments, void 0, function* ({ username, system, }) {
            LoggingUtilities_1.LoggingUtilities.service.debug("AuthService.checkIfUsernameExistsWithinSystem", `Finding username: ${username} in system: ${system}`);
            const existingRecord = yield this.db.find("tb_aa_user", { username: username, system: system }, { limit: 1 });
            if (existingRecord.length > 0) {
                LoggingUtilities_1.LoggingUtilities.service.info("AuthService.checkIfUsernameExistsWithinSystem", `Found username: ${username} in system: ${system}`);
                return { exist: true, nextStep: "login" };
            }
            LoggingUtilities_1.LoggingUtilities.service.warn("AuthService.checkIfUsernameExistsWithinSystem", `Username: ${username} does not exists within system: ${system}`);
            return { exist: false, nextStep: "register" };
        });
    }
    createNewUser(_a) {
        return __awaiter(this, arguments, void 0, function* ({ username, password, system, role, }) {
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.createNewUser", `Creating user: ${username} for system: ${system} with roles: ${role}`);
            const saltRounds = 10;
            const hashedPassword = yield bcrypt_1.default.hash(password, saltRounds);
            try {
                yield this.db.insert("tb_aa_user", {
                    username: username,
                    password: hashedPassword,
                    system: system,
                    role: role,
                    username_system: `${username}_${system}`,
                    state: "REGISTER",
                    created_dt: new Date().getTime(),
                    created_by: "SYSTEM",
                    record_status: "A",
                });
                LoggingUtilities_1.LoggingUtilities.service.info("AuthService.createNewUser", `Sucessfully created ${username}_${system}`);
                return this.login({ username, password, system });
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("AuthService.createNewUser", `Something went wrong registering ${username} - ${error}`);
                return { token: "" };
            }
        });
    }
    login(_a) {
        return __awaiter(this, arguments, void 0, function* ({ username, password, system, }) {
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.login", `Attempting to login for ${username}_${system}`);
            const existingUser = yield this.db.findOne("tb_aa_user", {
                username_system: `${username}_${system}`,
            });
            if (!existingUser) {
                LoggingUtilities_1.LoggingUtilities.service.error("AuthService.login", `${username}_${system} could not be found.`);
                throw new UnknownException_1.UnknownException();
            }
            const isValidPassword = yield bcrypt_1.default.compare(password, existingUser.password);
            LoggingUtilities_1.LoggingUtilities.service.error("AuthService.login", `Password comparison result: ${isValidPassword}`);
            if (!isValidPassword) {
                throw new UnknownException_1.UnknownException();
            }
            const generatedToken = yield this.tokenService.generateToken({
                username: existingUser.username,
                system: existingUser.system,
                role: existingUser.role,
                lastLoggedInDt: existingUser.last_logged_in_dt,
            });
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.login", `Success login for ${username}_${system} with token: ${generatedToken}`);
            yield this.db.update("tb_aa_user", {
                username_system: existingUser.username_system,
            }, {
                token: generatedToken,
                last_logged_in_dt: new Date().getTime(),
                state: "ACTIVE",
            });
            return { token: generatedToken };
        });
    }
    authenticateToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.authenticateToken", "Checking if token has expired / is valid format / if user exists");
            const decodedToken = yield this.tokenService.decodeToken(token);
            const { exist } = yield this.checkIfUsernameExistsWithinSystem({
                username: decodedToken.username,
                system: decodedToken.system,
            });
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.authenticateToken", `Does ${decodedToken.username}_${decodedToken.system} exists - ${exist}`);
            return { username: decodedToken.username, role: decodedToken.role, exist };
        });
    }
    validatePassword(username_system, password) {
        return __awaiter(this, void 0, void 0, function* () {
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.validatePassword", `Validating password for ${username_system}`);
            const existingUser = yield this.db.findOne("tb_aa_user", {
                username_system: username_system,
                record_status: "A",
            });
            if (!existingUser) {
                LoggingUtilities_1.LoggingUtilities.service.error("AuthService.validatePassword", `${username_system} could not be found.`);
                throw new UnknownException_1.UnknownException();
            }
            const isValidPassword = yield bcrypt_1.default.compare(password, existingUser.password);
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.validatePassword", `Password validation result for ${username_system} - ${isValidPassword}`);
            return { isValid: isValidPassword };
        });
    }
    updatePassword(username_system, newPassword) {
        return __awaiter(this, void 0, void 0, function* () {
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.updatePassword", `Updating password for ${username_system}`);
            const saltRounds = 10;
            const hashedPassword = yield bcrypt_1.default.hash(newPassword, saltRounds);
            yield this.db.update("tb_aa_user", {
                username_system: username_system,
                record_status: "A",
            }, {
                password: hashedPassword,
            });
            LoggingUtilities_1.LoggingUtilities.service.info("AuthService.updatePassword", `Successfully updated password for ${username_system}`);
        });
    }
}
exports.AuthService = AuthService;
