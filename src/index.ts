// Environment File

import dotenv from "dotenv";

const envFile = process.env.NODE_ENV === "prd" ? ".env" : ".env.dev";

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
import createFndController from "./fnd/Fnd.controller";
import createItineraryController from "./itinerary/Itinerary.controller";
import createFileController from "./file/File.controller";
import createFeatureController from "./feature/Feature.controller";
import createDouyinController from "./douyin/Douyin.controller";
import { globalLimiter, featureLimiter, douyinLimiter } from "./middlewares/RateLimiter";
import { MandatoryTokenFilter } from "./middlewares/TokenFilter";

async function startServer() {
  const app: Application = express();
  const port: number = 3000;

  // CORS — must come before rate limiter so preflight OPTIONS requests are not blocked
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    methods: "GET,POST,OPTIONS",
    credentials: true,
    optionsSuccessStatus: 204,
  };
  app.use(cors(corsOptions));
  app.options("/{*path}", cors(corsOptions)); // handle preflight for all routes

  // Middleware
  app.use(globalLimiter);
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true, parameterLimit: 5000 }));

  // Initialize database
  const db = await initializeDatabase();

  // Inject db into controllers
  // Use custom middlewares in each controllers
  app.use("/connectivity", [RestRequestLogger, RequestHeaderFilter], createConnectivityController(db));
  app.use("/api/hdb", [RestRequestLogger, RequestHeaderFilter], createHdbController(db));
  app.use("/api/lta", [RestRequestLogger, RequestHeaderFilter], createLtaController(db));
  app.use("/api/auth", [RestRequestLogger, RequestHeaderFilter], createAuthController(db));
  app.use("/api/fnd", [RestRequestLogger], createFndController(db));
  app.use("/api/pfp", [RestRequestLogger, RequestHeaderFilter], createPfpController(db));
  app.use("/api/analytics", [RestRequestLogger, RequestHeaderFilter], createHeartbeatController(db));
  app.use("/api/itinerary", [RestRequestLogger, RequestHeaderFilter], createItineraryController(db));
  app.use("/api/file", [RestRequestLogger, RequestHeaderFilter], createFileController(db));
  app.use("/api/feature", [RestRequestLogger, RequestHeaderFilter, featureLimiter], createFeatureController(db));
  app.use("/api/douyin", [RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter, douyinLimiter], createDouyinController(db));

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
import { RequestHeaderFilter } from "./middlewares/RequestHeaderFilter";
startDiscordBot();
