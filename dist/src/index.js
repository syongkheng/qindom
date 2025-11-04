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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const LoggingUtilities_1 = require("./utils/LoggingUtilities");
const mysql_1 = require("./config/db/mysql");
const RestRequestLogger_1 = require("./middlewares/RestRequestLogger");
// Controllers
const Connectivity_controller_1 = __importDefault(require("./controllers/Connectivity.controller"));
const Hdb_controller_1 = __importDefault(require("./controllers/Hdb.controller"));
const Lta_controller_1 = __importDefault(require("./controllers/Lta.controller"));
const Auth_controller_1 = __importDefault(require("./controllers/Auth.controller"));
const Fnd_controller_1 = __importDefault(require("./controllers/Fnd.controller"));
const Pfp_controller_1 = __importDefault(require("./controllers/Pfp.controller"));
function startServer() {
    return __awaiter(this, void 0, void 0, function* () {
        const app = (0, express_1.default)();
        const port = 3000;
        // Middleware
        app.use(express_1.default.json({ limit: "5mb" }));
        app.use(express_1.default.urlencoded({ limit: "5mb", extended: true, parameterLimit: 5000 }));
        // Cors
        const corsOptions = {
            origin: "*",
            methods: "GET,POST",
            credentials: true,
            optionsSuccessStatus: 204,
        };
        app.use((0, cors_1.default)(corsOptions));
        // Initialize database
        const db = yield (0, mysql_1.initializeDatabase)();
        // Inject db into controllers
        // Use custom middlewares in each controllers
        app.use("/connectivity", [RestRequestLogger_1.RestRequestLogger], (0, Connectivity_controller_1.default)(db));
        app.use("/hdb", [RestRequestLogger_1.RestRequestLogger], (0, Hdb_controller_1.default)(db));
        app.use("/lta", [RestRequestLogger_1.RestRequestLogger], (0, Lta_controller_1.default)(db));
        app.use("/api/auth", [RestRequestLogger_1.RestRequestLogger], (0, Auth_controller_1.default)(db));
        app.use("/api/fnd", [RestRequestLogger_1.RestRequestLogger], (0, Fnd_controller_1.default)(db));
        app.use("/api/pfp", [RestRequestLogger_1.RestRequestLogger], (0, Pfp_controller_1.default)(db));
        // Start server
        app.listen(port, () => {
            LoggingUtilities_1.LoggingUtilities.service.info("server", `Server started on port: ${port}`);
        });
    });
}
// Start the application
startServer();
