import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import { adminLimiter } from "../middlewares/RateLimiter.js";
import { RecentRequestLogDto, RequestLogMatchDto } from "../utils/logging/RequestLog.types.js";
import { getUser, requireRole, route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { TelegramLogMatrix, TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";
import { Roles } from "./Permission.js";
import { AuthAdminService } from "./AuthAdmin.service.js";
import {
  parseRecentLogsLimit,
  validateRequestIdParam,
  validateTelegramChatIdParam,
  validateTelegramLogToggleBody,
  validateTelegramModuleKeyParam,
  validateUserIdParam,
  validateUserRolesBody,
} from "./Auth.validator.js";
import { AuthAdminUserDto, AuthUpdatedDto } from "./Auth.types.js";

/** Every admin route: a valid session (roles read from the DB row), then the admin limiter. */
const ADMIN_MIDDLEWARE = [MandatoryTokenFilter, adminLimiter];

/**
 * `/auth/admin/*`, OWNER (SYSTEM_R5) only. Mounted by `createAuthController`. Resource grants
 * (tb_aa_resource_access) never confer roles, so they never open these routes.
 */
export default function createAuthAdminController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new AuthAdminService(db);
  const telegramLogSubscriptions = new TelegramLogSubscriptionService(db);

  router.get(
    "/users",
    ADMIN_MIDDLEWARE,
    route("AuthAdminController.GET /admin/users", "Failed to load users", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      return cr.ok<AuthAdminUserDto[]>(await svc.listUsers(req.logContext));
    }),
  );

  router.post(
    "/users/:id/roles",
    ADMIN_MIDDLEWARE,
    route("AuthAdminController.POST /admin/users/:id/roles", "Failed to update roles", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      const userId = validateUserIdParam(req.params.id);
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { roles } = validateUserRolesBody(req.body, event);
      return cr.ok<AuthUpdatedDto>(await svc.updateUserRoles(getUser(req).id, userId, roles, req.logContext));
    }),
  );

  // Newest N requests overall, for the dashboard's compact log widget. A distinct path
  // segment from /request-logs/:requestId, so the two never compete for a match.
  router.get(
    "/recent-request-logs",
    ADMIN_MIDDLEWARE,
    route("AuthAdminController.GET /admin/recent-request-logs", "Failed to load recent logs", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      return cr.ok<RecentRequestLogDto[]>(svc.recentRequestLogs(parseRecentLogsLimit(req.query.limit)));
    }),
  );

  // Searches the request-log files for one request's rendered tree.
  router.get(
    "/request-logs/:requestId",
    ADMIN_MIDDLEWARE,
    route("AuthAdminController.GET /admin/request-logs/:requestId", "Failed to search logs", async (req, cr) => {
      requireRole(req, Roles.OWNER);
      return cr.ok<RequestLogMatchDto[]>(svc.findRequestLogs(validateRequestIdParam(req.params.requestId)));
    }),
  );

  // Full chat × module matrix (every whitelisted chat with an active telegram_chat_id).
  router.get(
    "/telegram-log-subscriptions",
    ADMIN_MIDDLEWARE,
    route(
      "AuthAdminController.GET /admin/telegram-log-subscriptions",
      "Failed to load Telegram log subscriptions",
      async (req, cr) => {
        requireRole(req, Roles.OWNER);
        return cr.ok<TelegramLogMatrix>(await telegramLogSubscriptions.listMatrix(req.logContext));
      },
    ),
  );

  // Turns one chat's alerts for one module on/off; answers with the refreshed matrix.
  router.post(
    "/telegram-log-subscriptions/:chatId/:moduleKey",
    ADMIN_MIDDLEWARE,
    route(
      "AuthAdminController.POST /admin/telegram-log-subscriptions/:chatId/:moduleKey",
      "Failed to update Telegram log subscription",
      async (req, cr) => {
        requireRole(req, Roles.OWNER);
        const moduleKey = validateTelegramModuleKeyParam(req.params.moduleKey);
        const chatId = validateTelegramChatIdParam(req.params.chatId);
        const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
        const { enabled } = validateTelegramLogToggleBody(req.body, event);
        await telegramLogSubscriptions.setEnabled(chatId, moduleKey, enabled, req.logContext);
        return cr.ok<TelegramLogMatrix>(await telegramLogSubscriptions.listMatrix(req.logContext));
      },
    ),
  );

  return router;
}
