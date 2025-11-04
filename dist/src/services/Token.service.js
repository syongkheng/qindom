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
exports.TokenService = void 0;
const UnknownException_1 = require("../exceptions/UnknownException");
const LoggingUtilities_1 = require("../utils/LoggingUtilities");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class TokenService {
    constructor(db) {
        this.db = db;
        this.jwtExpiration = "1y";
        this.jwtSecret = process.env.JWT_SECRET;
        if (!this.jwtSecret) {
            LoggingUtilities_1.LoggingUtilities.service.error("TokenService", "JWT_SECRET is not set in environment variables");
            throw new Error("JWT_SECRET environment variable not set");
        }
    }
    generateToken(_a) {
        return __awaiter(this, arguments, void 0, function* ({ username, system, role, lastLoggedInDt, }) {
            LoggingUtilities_1.LoggingUtilities.service.info("TokenService.generateToken", `Generating token`);
            try {
                const token = jsonwebtoken_1.default.sign({ username, system, role, lastLoggedInDt }, this.jwtSecret, { expiresIn: this.jwtExpiration });
                LoggingUtilities_1.LoggingUtilities.service.info("TokenService.generateToken", `Token generated - ${token}`);
                return token;
            }
            catch (error) {
                LoggingUtilities_1.LoggingUtilities.service.error("TokenService.generateToken", `Something went wrong generating the token: ${error}`);
                return "";
            }
        });
    }
    decodeToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            LoggingUtilities_1.LoggingUtilities.service.info("TokenService.decodeToken", `Decoding: ${token}`);
            try {
                const decoded = jsonwebtoken_1.default.verify(token, this.jwtSecret);
                LoggingUtilities_1.LoggingUtilities.service.info("TokenService.decodeToken", `Decoded: ${JSON.stringify(Object.assign({}, decoded))}`);
                return decoded;
            }
            catch (error) {
                if (error instanceof Error) {
                    if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                        LoggingUtilities_1.LoggingUtilities.service.error("TokenService.decodeToken", `Token has expired.`);
                        throw new UnknownException_1.UnknownException();
                    }
                    if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                        LoggingUtilities_1.LoggingUtilities.service.error("TokenService.decodeToken", `Invalid token format.`);
                        throw new UnknownException_1.UnknownException();
                    }
                }
                LoggingUtilities_1.LoggingUtilities.service.error("TokenService.decodeToken", `Something went wrong decoding token.`);
                throw new UnknownException_1.UnknownException();
            }
        });
    }
}
exports.TokenService = TokenService;
