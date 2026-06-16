// Environment File

import dotenv from "dotenv";

const envFile = process.env.NODE_ENV === "prd" ? ".env" : ".env.dev";

dotenv.config({ path: envFile });

import express, { Application } from "express";
import cors from "cors";
import { LoggingUtilities } from "./utils/logging/LoggingUtilities.js";
import { initializeDatabase } from "./config/db/mysql.js";
import { RestRequestLogger } from "./middlewares/RestRequestLogger.js";

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
import { TgImageService } from "./tgimage/TgImage.service.js";
import { initTgImageBot } from "./tgimage/TgImage.bot.js";
import { globalLimiter, douyinLimiter } from "./middlewares/RateLimiter.js";
import { MandatoryTokenFilter } from "./middlewares/TokenFilter.js";

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
    methods: "GET,POST,OPTIONS",
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

  // Inject db into controllers
  // Use custom middlewares in each controllers
  app.use("/connectivity", [RestRequestLogger, RequestHeaderFilter], createConnectivityController(db));
  app.use("/api/hdb", [RestRequestLogger, RequestHeaderFilter], createHdbController(db));
  app.use("/api/lta", [RestRequestLogger, RequestHeaderFilter], createLtaController(db));
  app.use("/api/auth", [RestRequestLogger, RequestHeaderFilter], createAuthController(db));
  app.use("/api/pfp", [RestRequestLogger, RequestHeaderFilter], createPfpController(db));
  app.use("/api/itinerary", [RestRequestLogger, RequestHeaderFilter], createItineraryController(db));
  app.use("/api/file", [RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter], createFileController(db));
  app.use("/api/img", [RestRequestLogger], createTgImageGetController(db));
  app.use("/api/img", [RestRequestLogger, MandatoryTokenFilter], createTgImageController(db));
  app.use(
    "/api/douyin",
    [RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter, douyinLimiter],
    createDouyinController(db),
  );
  app.use("/api/geocode", [RestRequestLogger, RequestHeaderFilter], createGeocodeController(db));
  // app.post("/api/telegram/webhook", createTelegramWebhookHandler(db));
  app.use("/api/trail", [RestRequestLogger, RequestHeaderFilter, MandatoryTokenFilter], createTrailController(db));

  // LLM
  app.use("/v1/llm", [RestRequestLogger, RequestHeaderFilter, RequestApiKeyFilter], createLlmControllerV1(db));

  // Siri Shortcuts
  app.use("/v1/ss", [RestRequestLogger, RequestHeaderFilter, RequestApiKeyFilter], createSsBabyControllerV1(db));

  // Start server
  app.listen(port, () => {
    LoggingUtilities.service.info("server", `Server started on port: ${port}`);
    LoggingUtilities.service.info("server", `Environment: ${process.env.NODE_ENV}`);
    initTgImageBot(db)
      .then(async () => {
        const chatId = await new TgImageService(db).getStorageChatId();
        const token = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
        if (chatId && token) {
          LoggingUtilities.setLogSender((text) => {
            const payload = text.length > 3900 ? text.slice(0, 3890) + "\n[...]" : text;

            const escaped = payload.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                chat_id: chatId,
                parse_mode: "HTML",
                text: `<pre>${escaped}</pre>`,
              }),
            }).catch(() => {});
          });
        }
      })
      .catch((err) => LoggingUtilities.service.error("TgImageBot", err?.message ?? String(err)));
  });
}

// Start the application
startServer();

// Start Discord Bot
import { startDiscordBot } from "./fnd/discord/Fnd.bot.js";
import { RequestHeaderFilter } from "./middlewares/RequestHeaderFilter.js";
import { RequestApiKeyFilter } from "./middlewares/ApiKeyFilter.js";
import createSsBabyControllerV1 from "./siri-shortcut/Baby.v1.controller.js";

startDiscordBot().catch((err) => LoggingUtilities.service.error("Discord", err?.message ?? String(err)));
