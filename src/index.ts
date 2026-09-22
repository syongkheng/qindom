// Environment File

import dotenv from "dotenv";

const envFile = process.env.NODE_ENV === "prd" ? ".env" : ".env.dev";

dotenv.config({ path: envFile, override: true });

import express, { Application, RequestHandler, Router } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { LoggingUtilities } from "./utils/logging/LoggingUtilities.js";
import { initializeDatabase } from "./config/db/mysql.js";
import { RestRequestLogger } from "./middlewares/RestRequestLogger.js";
import { MandatoryTokenFilter } from "./middlewares/TokenFilter.js";
import { globalLimiter } from "./middlewares/RateLimiter.js";
import { mw } from "./middlewares/presets.js";

// Controllers
import createConnectivityController from "./connectivity/Connectivity.controller.js";
import createHeartbeatController from "./analytics/Heartbeat.controller.js";
import createHdbController from "./hdb/Hdb.controller.js";
import createLtaController from "./lta/Lta.controller.js";
import createAuthController from "./auth/Auth.controller.js";
import createPfpController from "./profile/Pfp.controller.js";
import createItineraryController from "./itinerary/Itinerary.controller.js";
import createBudgetController from "./budget/Budget.controller.js";
import createApplePayDashboardController from "./applepay/ApplePayDashboard.controller.js";
import createFileController from "./file/File.controller.js";
import createGeocodeController from "./geocode/Geocode.controller.js";
import { createTgImageGetController, createTgImageController } from "./tgimage/TgImage.controller.js";
import createLlmControllerV1 from "./llm/Llm.v1.controller.js";
import createTrailController from "./trail/Trail.controller.js";
import createSsApplePayControllerV1 from "./siri-shortcut/ApplePay.v1.controller.js";
import createSsApiKeyController from "./ss-api-key/SsApiKey.controller.js";
import createAigApiKeyController from "./aig/AigApiKey.controller.js";
import createIotController from "./iot/Iot.controller.js";
import createIotApiKeyController from "./iot/IotApiKey.controller.js";
import { startDiscordBot } from "./fnd/discord/Fnd.bot.js";
import { setupTelegramLogSender } from "./tgimage/TgImage.logSender.js";

// Wedding
import createWeddingController from "./wedding/Wedding.controller.js";

// Garmin
import createGarminController from "./garmin/Garmin.controller.js";
import { startGarminScheduler } from "./garmin/Garmin.scheduler.js";

// Suggestion
import createSuggestionController from "./suggestion/Suggestion.controller.js";

// Places
import createPlacesController from "./places/Places.controller.js";

async function startServer() {
  const app: Application = express();
  const port: number = Number(process.env.PORT) || 3000;

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
    methods: "GET,POST,DELETE,OPTIONS",
    credentials: true,
    optionsSuccessStatus: 204,
  };
  app.use(cors(corsOptions));
  app.options("/{*path}", cors(corsOptions)); // handle preflight for all routes

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (process.env.NODE_ENV === "prd") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // Middleware
  app.use(globalLimiter);
  app.use(cookieParser());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true, parameterLimit: 5000 }));
  app.disable("x-powered-by");

  // Initialize database
  const db = await initializeDatabase();

  // Route table — [path, middlewares, router]
  const routes: [string, RequestHandler[], Router][] = [
    ["/connectivity",  mw.std,                                    createConnectivityController(db)],
    ["/api/analytics", mw.std,                                    createHeartbeatController(db)],
    ["/api/hdb",       mw.std,                                    createHdbController(db)],
    ["/api/lta",       mw.std,                                    createLtaController(db)],
    ["/api/auth",      mw.std,                                    createAuthController(db)],
    ["/api/pfp",       mw.std,                                    createPfpController(db)],
    ["/api/itinerary", mw.std,                                    createItineraryController(db)],
    ["/api/budget",    mw.auth,                                   createBudgetController(db)],
    ["/api/applepay",  mw.auth,                                   createApplePayDashboardController(db)],
    ["/api/file",      mw.auth,                                   createFileController(db)],
    ["/api/img",       mw.pub,                                    createTgImageGetController(db)],
    ["/api/img",       [RestRequestLogger, MandatoryTokenFilter], createTgImageController(db)],  // no RHF — multipart upload
    ["/api/geocode",   mw.std,                                    createGeocodeController(db)],
    ["/api/trail",     mw.auth,                                   createTrailController(db)],
    ["/v1/llm",        mw.apiKey,                                 createLlmControllerV1(db)],
    ["/v1/ss",         mw.apiKey,                                 createSsApplePayControllerV1(db)],
    ["/api/ss-key",    mw.auth,                                   createSsApiKeyController(db)],
    ["/api/aig",       mw.auth,                                   createAigApiKeyController(db)],
    ["/iot",           mw.apiKey,                                 createIotController(db)],
    ["/api/iot-key",   mw.auth,                                   createIotApiKeyController(db)],
    ["/wedding",         mw.std,                                  createWeddingController(db)],
    ["/api/suggestion",  mw.std,                                  createSuggestionController(db)],
    ["/api/garmin",      mw.auth,                                 createGarminController(db)],
    ["/api/places",      mw.std,                                  createPlacesController(db)],
  ];
  routes.forEach(([path, mws, router]) => app.use(path, mws, router));

  // Start server
  app.listen(port, () => {
    LoggingUtilities.service.info("server", `Server started on port: ${port}`);
    LoggingUtilities.service.info("server", `Environment: ${process.env.NODE_ENV}`);
    // CDN admin bot (/start /stats /list) intentionally not started — its
    // long-polling loop isn't needed for the actual upload/serve path
    // (TgImageService talks to Telegram's HTTP API directly), and it was
    // producing periodic "EFATAL: fetch failed" polling-error log noise.
    // The Telegram-based error-log sender doesn't depend on the bot/polling
    // at all, so it still starts on its own here.
    setupTelegramLogSender();
    startGarminScheduler(db);
  });
}

// Start the application
startServer();

startDiscordBot().catch((err) => LoggingUtilities.service.error("Discord", err?.message ?? String(err)));
