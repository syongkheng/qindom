// Environment File

import dotenv from "dotenv";

const envFile = process.env.NODE_ENV === "prd" ? ".env" : ".env.dev";

console.log("Using environment file: ", process.env.NODE_ENV);

dotenv.config({ path: envFile });

import express, { Application } from "express";
import cors from "cors";
import { LoggingUtilities } from "./utils/LoggingUtilities";
import { initializeDatabase } from "./config/db/mysql";
import { RestRequestLogger } from "./middlewares/RestRequestLogger";

// Controllers
import createConnectivityController from "./connectivity/Connectivity.controller";
import createHdbController from "./hdb/Hdb.controller";
import createLtaController from "./lta/Lta.controller";
import createAuthController from "./auth/Auth.controller";
import createPfpController from "./profile/Pfp.controller";
import createHeartbeatController from "./analytics/Heartbeat.controller";



async function startServer() {
  const app: Application = express();
  const port: number = 3000;

  // Middleware
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true, parameterLimit: 5000 }));

  // Cors

  const corsOptions = {
    origin: "*",
    methods: "GET,POST",
    credentials: true,
    optionsSuccessStatus: 204,
  };
  app.use(cors(corsOptions));

  // Initialize database
  const db = await initializeDatabase();

  // Inject db into controllers
  // Use custom middlewares in each controllers
  app.use("/connectivity", [RestRequestLogger], createConnectivityController(db));
  app.use("/api/hdb", [RestRequestLogger], createHdbController(db));
  app.use("/api/lta", [RestRequestLogger], createLtaController(db));
  app.use("/api/auth", [RestRequestLogger], createAuthController(db));
  // app.use("/api/fnd", [RestRequestLogger], createFndController(db));
  app.use("/api/pfp", [RestRequestLogger], createPfpController(db));
  app.use("/api/analytics", [RestRequestLogger], createHeartbeatController(db));

  // Start server
  app.listen(port, () => {
    LoggingUtilities.service.info("server", `Server started on port: ${port}`);
    LoggingUtilities.service.info("server", `Environment: ${process.env.NODE_ENV}`);
  });
}

// Start the application
startServer();

// Start Discord Bot
import { startDiscordBot } from "./fnd/discord/Fnd.bot";
startDiscordBot();
