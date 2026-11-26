// Must stay the first import: loads .env / .env.dev before any other module is evaluated (see config/README.md).
import { ENV_FILE } from "./config/loadEnv.js";
import { APP_ENV } from "./config/env.js";
import { parseAllowedOrigins } from "./config/cors.js";
import { initializeDatabase } from "./config/db/mysql.js";
import { createApp } from "./app.js";
import { LoggingUtilities } from "./utils/logging/LoggingUtilities.js";
import { toMessage } from "./utils/ErrorUtilities.js";
import { getJwtSecret } from "./token/Token.service.js";
import { setupTelegramLogSender } from "./utils/logging/TelegramLogSender.js";
import { initTgImageBot } from "./tgimage/TgImage.bot.js";
import { CameraService } from "./camera/Camera.service.js";
import { CameraRelay } from "./camera/Camera.relay.js";
import { PairingCodeStore } from "./camera/Camera.pairing.js";
import { attachCameraWebSockets } from "./camera/Camera.ws.js";

const DEFAULT_PORT = 3000;
const LOG_TAG = "server";

/** Boot order: env (first import) → JWT secret → DB → app (routes, 404, ErrorHandler) → listen → camera WS → Telegram. */
async function startServer() {
  getJwtSecret(); // fail fast at boot (PM2 restart loop → deploy health check fails) if JWT_SECRET is missing
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

  const db = await initializeDatabase(); // exits the process if the DB is unreachable

  // Camera relay state is in memory (single PM2 process); device bindings are in tb_camera_device.
  const cameraRelay = new CameraRelay();
  const cameraService = new CameraService(db, cameraRelay, new PairingCodeStore());

  const app = createApp({ db, cameraService, allowedOrigins });

  const server = app.listen(port, () => {
    LoggingUtilities.service.info(LOG_TAG, `Server started on port: ${port}`);
    LoggingUtilities.service.info(LOG_TAG, `Environment: ${APP_ENV} (env file: ${ENV_FILE})`);
    // The Telegram error-log sender doesn't need the bot, so it starts on its own.
    setupTelegramLogSender();
    // TgImage bot polling is the only place a new admin's chat_id is captured (/start, for
    // tb_tg_stats_whitelist). The CDN upload/serve path doesn't need it. polling_error is caught and
    // logged in TgImage.bot.ts, and a failed start is logged here, so neither can crash the server.
    initTgImageBot(db).catch((err) => LoggingUtilities.service.error("TgImageBot", toMessage(err)));
  });

  // WebSocket upgrades bypass Express middleware; auth happens in the upgrade handler.
  attachCameraWebSockets(server, { service: cameraService, relay: cameraRelay, allowedOrigins });
}

// A boot failure (e.g. missing JWT_SECRET) exits non-zero, as the unhandled rejection used to.
startServer().catch((err) => {
  LoggingUtilities.service.error(LOG_TAG, `Startup failed: ${toMessage(err)}`);
  process.exit(1);
});
