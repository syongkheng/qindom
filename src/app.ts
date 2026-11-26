import express, { Application, RequestHandler, Router } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import KnexSqlUtilities from "./utils/KnexSqlUtilities.js";
import { IS_PRD } from "./config/env.js";
import { createCorsOptions } from "./config/cors.js";
import { globalLimiter } from "./middlewares/RateLimiter.js";
import { mw } from "./middlewares/presets.js";
import { ErrorHandler } from "./middlewares/ErrorHandler.js";
import { CameraService } from "./camera/Camera.service.js";

// Controllers
import createConnectivityController from "./connectivity/Connectivity.controller.js";
import createAnalyticsLegacyController from "./analytics/AnalyticsLegacy.controller.js";
import createAnalyticsController from "./analytics/Analytics.controller.js";
import createLtaController from "./lta/Lta.controller.js";
import createAuthController from "./auth/Auth.controller.js";
import createProfileController from "./profile/Profile.controller.js";
import createItineraryController from "./itinerary/Itinerary.controller.js";
import createBudgetController from "./budget/Budget.controller.js";
import createTodoController from "./todo/Todo.controller.js";
import createHouseLayoutController from "./house/HouseLayout.controller.js";
import { createHouseShareController, createHouseShareViewController } from "./house/HouseShare.controller.js";
import createApplePayController from "./applepay/ApplePay.controller.js";
import createFileController from "./file/File.controller.js";
import { createTgImageGetController, createTgImageController } from "./tgimage/TgImage.controller.js";
import createGeocodeController from "./geocode/Geocode.controller.js";
import createSsTodoControllerV1 from "./siri-shortcut/Todo.v1.controller.js";
import createSsApplePayControllerV2 from "./siri-shortcut/ApplePay.v2.controller.js";
import createSsApiKeyController from "./ss-api-key/SsApiKey.controller.js";
import createWeddingController from "./wedding/Wedding.controller.js";
import createSuggestionController from "./suggestion/Suggestion.controller.js";
import createCameraController from "./camera/Camera.controller.js";
import createPdcaEnquiryController from "./pdca/PdcaEnquiry.controller.js";
import createDebugController from "./debug/Debug.controller.js";

const BODY_LIMIT = "5mb";
const URLENCODED_PARAMETER_LIMIT = 5000;
const HSTS_VALUE = "max-age=31536000; includeSubDomains";
const NOT_FOUND = 404;
const NOT_FOUND_TEXT = "Not Found";

export type RouteEntry = [prefix: string, preset: RequestHandler[], router: Router];

export interface AppDependencies {
  db: KnexSqlUtilities;
  cameraService: CameraService;
  /** From `ALLOWED_ORIGINS`; index.ts passes the same list to the camera WebSocket origin check. */
  allowedOrigins: readonly string[];
}

export interface AppOptions {
  /** Prod switches (HSTS, login on `/debug`); injectable so tests cover both states. */
  isPrd?: boolean;
}

/** The route table: `[prefix, preset, router]`, mounted in this order. Presets live only in `middlewares/presets.ts`. */
export function createRoutes(db: KnexSqlUtilities, cameraService: CameraService, isPrd = IS_PRD): RouteEntry[] {
  return [
    ["/connectivity", mw.std, createConnectivityController(db)],
    ["/analytics", mw.std, createAnalyticsLegacyController(db)], // legacy POST / and /heartbeat
    ["/analytics", mw.std, createAnalyticsController(db)], // v1: /collect, /systems, /admin/*
    ["/lta", mw.std, createLtaController(db)],
    ["/auth", mw.std, createAuthController(db)],
    ["/pfp", mw.auth, createProfileController(db)],
    ["/itinerary", mw.std, createItineraryController(db)],
    ["/budget", mw.auth, createBudgetController(db)],
    ["/todo", mw.auth, createTodoController(db)],
    ["/house-layout", mw.auth, createHouseLayoutController(db)],
    ["/house/share", mw.auth, createHouseShareController(db)],
    ["/house/view", mw.housePublic, createHouseShareViewController(db)],
    ["/applepay", mw.auth, createApplePayController(db)],
    ["/file", mw.auth, createFileController(db)],
    ["/img", mw.pub, createTgImageGetController(db)],
    ["/img", mw.authUpload, createTgImageController(db)], // no RHF — multipart upload
    ["/geocode", mw.std, createGeocodeController(db)],
    ["/v1/ss", mw.ssKey, createSsTodoControllerV1(db)],
    ["/v2/ss", mw.ssKey, createSsApplePayControllerV2(db)],
    ["/ss-key", mw.auth, createSsApiKeyController(db)],
    ["/wedding", mw.std, createWeddingController(db)],
    ["/suggestion", mw.std, createSuggestionController(db)],
    ["/camera", mw.std, createCameraController(cameraService)], // auth per route
    // Public contact form; body logged as field lengths only (personal data)
    ["/pdca", mw.pdcaPublic, createPdcaEnquiryController(db)],
    // Open in dev for curl testing; prd requires login (+ SYSTEM_R5, checked in the controller)
    ["/debug", isPrd ? mw.auth : mw.std, createDebugController()],
  ];
}

function securityHeaders(isPrd: boolean): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (isPrd) res.setHeader("Strict-Transport-Security", HSTS_VALUE);
    next();
  };
}

// Marks the request log's pipeline stage: events after the route's middlewares belong to the
// controller (or the service layer, by event type). Every preset starts with RestRequestLogger.
const enterController: RequestHandler = (req, _res, next) => {
  req.logContext.currentStage = "controller";
  next();
};

/**
 * The Express app, without listening: CORS → security headers → global limiter → cookies/body parsers →
 * route table → JSON 404 → ErrorHandler. index.ts listens and attaches the camera WebSockets.
 */
export function createApp(deps: AppDependencies, { isPrd = IS_PRD }: AppOptions = {}): Application {
  const app = express();
  app.disable("x-powered-by");

  // CORS first, so preflight OPTIONS requests are answered (204) before the rate limiter.
  app.use(cors(createCorsOptions(deps.allowedOrigins)));
  app.use(securityHeaders(isPrd));
  app.use(globalLimiter);
  app.use(cookieParser());
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true, parameterLimit: URLENCODED_PARAMETER_LIMIT }));

  for (const [prefix, preset, router] of createRoutes(deps.db, deps.cameraService, isPrd)) {
    app.use(prefix, [...preset, enterController], router);
  }

  // Unmatched routes: JSON envelope instead of Express's default "Cannot GET /…" HTML page
  app.use((_req, res) => {
    res.status(NOT_FOUND).json({ code: NOT_FOUND, status: NOT_FOUND_TEXT, data: NOT_FOUND_TEXT });
  });

  // Must stay last — replaces Express's default handler, which leaks stack traces
  app.use(ErrorHandler);
  return app;
}
