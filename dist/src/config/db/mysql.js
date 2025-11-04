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
exports.initializeDatabase = initializeDatabase;
const knex_1 = __importDefault(require("knex"));
const dotenv_1 = __importDefault(require("dotenv"));
const KnexSqlUtilities_1 = __importDefault(require("../../utils/KnexSqlUtilities"));
const LoggingUtilities_1 = require("../../utils/LoggingUtilities");
// Load environment variables from .env file
dotenv_1.default.config();
// Define Knex configuration
const dbConfig = {
    client: "mysql2",
    connection: {
        host: process.env.DB_URL,
        user: process.env.DB_USER,
        password: process.env.DB_PW,
        database: process.env.DB_NAME,
        port: 3306,
    },
    pool: {
        min: 2,
        max: 10,
    },
};
// Initialize Knex with the configuration
const knexInstance = (0, knex_1.default)(dbConfig);
const db = new KnexSqlUtilities_1.default(knexInstance);
// Test connection and log status
function initializeDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            LoggingUtilities_1.LoggingUtilities.service.info("init_db", "Attempting to connect to database...");
            LoggingUtilities_1.LoggingUtilities.service.info("init_db", `   Host: ${process.env.DB_URL}`);
            LoggingUtilities_1.LoggingUtilities.service.info("init_db", `   Database: ${process.env.DB_NAME}`);
            LoggingUtilities_1.LoggingUtilities.service.info("init_db", `   User: ${process.env.DB_USER}`);
            // Test the connection
            yield db.raw("SELECT 1 as connection_test");
            LoggingUtilities_1.LoggingUtilities.service.info("init_db", "Database connection established");
            return db;
        }
        catch (error) {
            LoggingUtilities_1.LoggingUtilities.service.error("init_db", "Failed to connect to database");
            process.exit(1); // Exit if database connection fails
        }
    });
}
// Export the initialized database after testing connection
exports.default = db;
