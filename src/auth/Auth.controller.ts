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
import { IRequestLogContext } from "../models/IRequestLogContext.js";

export default function createAuthController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new AuthService(db);

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
      return cr.ok(await svc.login({ email, password, system, logContext }));
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
      return cr.ok(await svc.verifyEmail({ email, system, code, logContext }));
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

  // POST /verification — validate a JWT token
  router.post("/verification", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;
      const validationEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { token } = AuthValidator.validateValidateTokenRequest(req.body, validationEvent);
      const authenticateTokenLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "SERVICE", "Authenticating token")
        : undefined;
      return cr.ok(await svc.authenticateToken(token, authenticateTokenLoggingEvent));
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /verification", "Failed to verify token");
    }
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
