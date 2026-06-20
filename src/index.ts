// Environment File

import dotenv from "dotenv";

const envFile = process.env.NODE_ENV === "prd" ? ".env" : ".env.dev";

dotenv.config({ path: envFile, override: true });

import express, { Application, RequestHandler, Router } from "express";
import cors from "cors";
import { LoggingUtilities } from "./utils/logging/LoggingUtilities.js";
import { initializeDatabase } from "./config/db/mysql.js";
import { RestRequestLogger } from "./middlewares/RestRequestLogger.js";
import { MandatoryTokenFilter } from "./middlewares/TokenFilter.js";
import { globalLimiter, douyinLimiter } from "./middlewares/RateLimiter.js";
import { mw } from "./middlewares/presets.js";

// Controllers
import createConnectivityController from "./connectivity/Connectivity.controller.js";
import createHdbController from "./hdb/Hdb.controller.js";
import createLtaController from "./lta/Lta.controller.js";
import createAuthController from "./auth/Auth.controller.js";
import createPfpController from "./profile/Pfp.controller.js";
import createItineraryController from "./itinerary/Itinerary.controller.js";
import createFileController from "./file/File.controller.js";
import createDouyinController from "./douyin/Douyin.controller.js";
import createGeocodeController from "./geocode/Geocode.controller.js";
import { createTgImageGetController, createTgImageController } from "./tgimage/TgImage.controller.js";
import createLlmControllerV1 from "./llm/Llm.v1.controller.js";
import createTrailController from "./trail/Trail.controller.js";
import createSsBabyControllerV1 from "./siri-shortcut/Baby.v1.controller.js";
import createBabyApiKeyController from "./baby/BabyApiKey.controller.js";
import { startDiscordBot } from "./fnd/discord/Fnd.bot.js";
import { initTgImageBot } from "./tgimage/TgImage.bot.js";
import { setupTelegramLogSender } from "./tgimage/TgImage.logSender.js";

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
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true, parameterLimit: 5000 }));
  app.disable("x-powered-by");

  // Initialize database
  const db = await initializeDatabase();

  // Route table — [path, middlewares, router]
  const routes: [string, RequestHandler[], Router][] = [
    ["/connectivity",  mw.std,                                    createConnectivityController(db)],
    ["/api/hdb",       mw.std,                                    createHdbController(db)],
    ["/api/lta",       mw.std,                                    createLtaController(db)],
    ["/api/auth",      mw.std,                                    createAuthController(db)],
    ["/api/pfp",       mw.std,                                    createPfpController(db)],
    ["/api/itinerary", mw.std,                                    createItineraryController(db)],
    ["/api/file",      mw.auth,                                   createFileController(db)],
    ["/api/img",       mw.pub,                                    createTgImageGetController(db)],
    ["/api/img",       [RestRequestLogger, MandatoryTokenFilter], createTgImageController(db)],  // no RHF — multipart upload
    ["/api/douyin",    [...mw.auth, douyinLimiter],               createDouyinController(db)],
    ["/api/geocode",   mw.std,                                    createGeocodeController(db)],
    ["/api/trail",     mw.auth,                                   createTrailController(db)],
    ["/v1/llm",        mw.apiKey,                                 createLlmControllerV1(db)],
    ["/v1/ss",         mw.apiKey,                                 createSsBabyControllerV1(db)],
    ["/api/baby",      mw.auth,                                   createBabyApiKeyController(db)],
  ];
  routes.forEach(([path, mws, router]) => app.use(path, mws, router));

  // Start server
  app.listen(port, () => {
    LoggingUtilities.service.info("server", `Server started on port: ${port}`);
    LoggingUtilities.service.info("server", `Environment: ${process.env.NODE_ENV}`);
    initTgImageBot(db)
      .then(() => setupTelegramLogSender(db))
      .catch((err) => LoggingUtilities.service.error("TgImageBot", err?.message ?? String(err)));
  });
}

// Start the application
startServer();

startDiscordBot().catch((err) => LoggingUtilities.service.error("Discord", err?.message ?? String(err)));
