import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { AuthService } from "./Auth.service.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import {
  loginLimiter,
  registerLimiter,
  verifyEmailLimiter,
  resendVerifyLimiter,
  adminLimiter,
} from "../middlewares/RateLimiter.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { AuthValidator } from "./Auth.validator.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { getUser, handleException, hasRole } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { RequestLogSearch } from "../utils/logging/RequestLogSearch.js";
import { TelegramLogSubscriptionService } from "../utils/logging/TelegramLogSubscriptionService.js";
import { TELEGRAM_LOG_MODULE_KEYS } from "../utils/logging/TelegramLogModules.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { setAuthCookies, clearAuthCookies } from "../utils/AuthCookieUtilities.js";

export default function createAuthController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new AuthService(db);
  const telegramLogSubscriptionSvc = new TelegramLogSubscriptionService(db);

  // GET /admin/users — list all users (SYSTEM_R5 only)
  router.get("/admin/users", [MandatoryTokenFilter, adminLimiter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      if (!hasRole(req, "SYSTEM_R5")) return cr.result(403, "Forbidden", "Insufficient permissions");
      return cr.ok(await svc.listUsers());
    } catch (err) {
      return handleException(err, cr, "AuthController.GET /admin/users", "Failed to load users");
    }
  });

  // POST /admin/users/:id/roles — update a user's roles (SYSTEM_R5 only)
  router.post(
    "/admin/users/:id/roles",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!hasRole(req, "SYSTEM_R5")) return cr.result(403, "Forbidden", "Insufficient permissions");
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return cr.result(400, "Bad Request", "Invalid ID");
        const { roles } = req.body;
        if (!Array.isArray(roles)) throw new Exceptions.InvalidRequest("roles");
        return cr.ok(await svc.updateUserRoles(id, roles));
      } catch (err) {
        return handleException(err, cr, "AuthController.POST /admin/users/:id/roles", "Failed to update roles");
      }
    },
  );

  // GET /admin/recent-request-logs — newest N requests overall, for the dashboard's
  // compact log widget (SYSTEM_R5 only). Registered before /admin/request-logs/:requestId
  // as a distinct path segment so there's no route-matching ambiguity between them.
  router.get(
    "/admin/recent-request-logs",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!hasRole(req, "SYSTEM_R5")) return cr.result(403, "Forbidden", "Insufficient permissions");
        const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 20);
        const matches = RequestLogSearch.recent(limit).map(({ timestamp, method, path, statusCode }) => ({
          timestamp,
          method,
          path,
          statusCode,
        }));
        return cr.ok(matches);
      } catch (err) {
        return handleException(err, cr, "AuthController.GET /admin/recent-request-logs", "Failed to load recent logs");
      }
    },
  );

  // GET /admin/request-logs/:requestId — search PM2 log files for a request's rendered tree (SYSTEM_R5 only)
  router.get(
    "/admin/request-logs/:requestId",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!hasRole(req, "SYSTEM_R5")) return cr.result(403, "Forbidden", "Insufficient permissions");
        const requestId = req.params.requestId;
        if (!/^req_[0-9a-f]{5}$/i.test(requestId)) return cr.result(400, "Bad Request", "Invalid Request ID format");
        const matches = RequestLogSearch.find(requestId);
        if (!matches.length) return cr.result(404, "Not Found", "No log entries found for that Request ID");
        return cr.ok(matches);
      } catch (err) {
        return handleException(err, cr, "AuthController.GET /admin/request-logs/:requestId", "Failed to search logs");
      }
    },
  );

  // GET /admin/telegram-log-subscriptions — full chat × module matrix
  // (every whitelisted admin who has an active telegram_chat_id, not just one) (SYSTEM_R5 only)
  router.get(
    "/admin/telegram-log-subscriptions",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!hasRole(req, "SYSTEM_R5")) return cr.result(403, "Forbidden", "Insufficient permissions");
        return cr.ok(await telegramLogSubscriptionSvc.listMatrix());
      } catch (err) {
        return handleException(
          err,
          cr,
          "AuthController.GET /admin/telegram-log-subscriptions",
          "Failed to load Telegram log subscriptions",
        );
      }
    },
  );

  // POST /admin/telegram-log-subscriptions/:chatId/:moduleKey — toggle one chat's
  // alerts for one module on/off (SYSTEM_R5 only)
  router.post(
    "/admin/telegram-log-subscriptions/:chatId/:moduleKey",
    [MandatoryTokenFilter, adminLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        if (!hasRole(req, "SYSTEM_R5")) return cr.result(403, "Forbidden", "Insufficient permissions");
        const { moduleKey } = req.params;
        if (!TELEGRAM_LOG_MODULE_KEYS.some((m) => m.key === moduleKey)) {
          return cr.result(400, "Bad Request", "Unknown module key");
        }
        const chatId = Number(req.params.chatId);
        if (!Number.isInteger(chatId) || chatId <= 0) return cr.result(400, "Bad Request", "Invalid chat ID");
        const { enabled } = req.body;
        if (typeof enabled !== "boolean") throw new Exceptions.InvalidRequest("enabled");
        await telegramLogSubscriptionSvc.setEnabled(chatId, moduleKey, enabled);
        return cr.ok(await telegramLogSubscriptionSvc.listMatrix());
      } catch (err) {
        return handleException(
          err,
          cr,
          "AuthController.POST /admin/telegram-log-subscriptions/:chatId/:moduleKey",
          "Failed to update Telegram log subscription",
        );
      }
    },
  );

  // POST /preflight — check if email exists (routes to login or register)
  router.post("/preflight", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { email, system } = AuthValidator.validatePreflightRequest(req.body, validationEvent);
      return cr.ok(await svc.checkIfEmailExistsWithinSystem({ email, system, logContext }));
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /preflight", "Failed to check email");
    }
  });

  // POST /login — authenticate with email + password
  router.post("/login", [loginLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { email, password, system } = AuthValidator.validateLoginRequest(req.body, validationEvent);
      const { token, ...rest } = await svc.login({ email, password, system, logContext });
      setAuthCookies(res, token);
      return cr.ok(rest);
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /login", "Failed to login");
    }
  });

  // POST /register — create account and send verification email
  router.post("/register", [registerLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { username, email, password, system } = AuthValidator.validateRegisterRequest(req.body, validationEvent);
      return cr.ok(await svc.createNewUser({ username, email, password, system, logContext }));
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /register", "Failed to register");
    }
  });

  // POST /verify-email — submit 6-digit OTP, returns JWT on success
  router.post("/verify-email", [verifyEmailLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { email, system, code } = AuthValidator.validateEmailVerifyRequest(req.body, validationEvent);
      const { token, ...rest } = await svc.verifyEmail({ email, system, code, logContext });
      setAuthCookies(res, token);
      return cr.ok(rest);
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /verify-email", "Failed to verify email");
    }
  });

  // POST /resend-verify — resend a new verification code
  router.post("/resend-verify", [resendVerifyLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { email, system } = AuthValidator.validatePreflightRequest(req.body, validationEvent);
      await svc.resendVerifyCode({ email, system, logContext });
      return cr.ok({ sent: true }); // Always respond 200 to avoid leaking whether the email is registered
    } catch {
      return cr.ok({ sent: true }); // intentionally swallow errors
    }
  });

  // POST /verification — validate the session cookie (MandatoryTokenFilter already verified it)
  router.post("/verification", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { username, roles } = getUser(req);
      return cr.ok({ username, roles, exist: true });
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /verification", "Failed to verify token");
    }
  });

  // POST /logout — clear the auth + CSRF cookies. Deliberately not gated behind
  // MandatoryTokenFilter: logout's whole job is to reset a broken/expired
  // session to a clean slate, so it must succeed even when the token or CSRF
  // check would otherwise fail — gating it meant the frontend's best-effort
  // logout-on-401 silently no-op'd exactly when cookies most needed clearing.
  router.post("/logout", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    clearAuthCookies(res);
    return cr.ok({ loggedOut: true });
  });

  router.post("/password/validate", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { username, system } = getUser(req);
      const { password } = AuthValidator.validatePasswordValidateRequest(req.body, validationEvent);
      const validatePasswordLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "SERVICE", "Validating password")
        : undefined;
      return cr.ok(await svc.validatePassword(`${username}_${system}`, password, validatePasswordLoggingEvent));
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /password/validate", "Failed to validate password");
    }
  });

  router.post("/password/update", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { username, system } = getUser(req);
      const { newPassword } = AuthValidator.validatePasswordUpdateRequest(req.body, validationEvent);
      const updatePasswordLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "SERVICE", "Updating password")
        : undefined;
      return cr.ok(await svc.updatePassword(`${username}_${system}`, newPassword, updatePasswordLoggingEvent));
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /password/update", "Failed to update password");
    }
  });

  return router;
}
