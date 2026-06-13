import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { AuthService } from "./Auth.service";
import { BaseExceptions } from "../exceptions/BaseException";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import {
  loginLimiter,
  registerLimiter,
  verifyEmailLimiter,
  resendVerifyLimiter,
  adminLimiter,
} from "../middlewares/RateLimiter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { AuthValidator } from "./Auth.validator";
import { Exceptions } from "../exceptions/AppExceptions";
import { toMessage } from "../utils/errorUtils";
import { getUser, handleException, hasRole } from "../utils/requestUtils";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";

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
      const { email, system } = AuthValidator.validatePreflightRequest(req);
      return cr.ok(await svc.checkIfEmailExistsWithinSystem({ email, system, logContext: req.logContext }));
    } catch (error) {
      if (error instanceof BaseExceptions)
        return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  // POST /login — authenticate with email + password
  router.post("/login", [loginLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { email, password, system } = AuthValidator.validateLoginRequest(req);
      return cr.ok(await svc.login({ email, password, system, logContext: req.logContext }));
    } catch (error) {
      if (error instanceof BaseExceptions)
        return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  // POST /register — create account and send verification email
  router.post("/register", [registerLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { username, email, password, system } = AuthValidator.validateRegisterRequest(req);
      return cr.ok(await svc.createNewUser({ username, email, password, system, logContext: req.logContext }));
    } catch (error) {
      if (error instanceof BaseExceptions)
        return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  // POST /verify-email — submit 6-digit OTP, returns JWT on success
  router.post("/verify-email", [verifyEmailLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { email, system, code } = AuthValidator.validateEmailVerifyRequest(req);
      return cr.ok(await svc.verifyEmail({ email, system, code, logContext: req.logContext }));
    } catch (error) {
      if (error instanceof BaseExceptions)
        return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  // POST /resend-verify — resend a new verification code
  router.post("/resend-verify", [resendVerifyLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { email, system } = AuthValidator.validatePreflightRequest(req);
      await svc.resendVerifyCode({ email, system, logContext: req.logContext });
      return cr.ok({ sent: true }); // Always respond 200 to avoid leaking whether the email is registered
    } catch {
      return cr.ok({ sent: true }); // intentionally swallow errors
    }
  });

  // POST /verification — validate a JWT token
  router.post("/verification", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { token } = AuthValidator.validateValidateTokenRequest(req);
      const authenticateTokenLoggingEvent = req.logContext
        ? LoggingUtilities.request.branch(req.logContext, "SERVICE", "Authenticating token")
        : undefined;
      return cr.ok(await svc.authenticateToken(token, authenticateTokenLoggingEvent));
    } catch (error) {
      if (error instanceof BaseExceptions)
        return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  router.post("/password/validate", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { username, system } = getUser(req);
      const { password } = AuthValidator.validatePasswordValidateRequest(req);

      const validatePasswordLoggingEvent = req.logContext
        ? LoggingUtilities.request.branch(req.logContext, "SERVICE", "Validating password")
        : undefined;
      return cr.ok(await svc.validatePassword(`${username}_${system}`, password, validatePasswordLoggingEvent));
    } catch (error) {
      if (error instanceof BaseExceptions)
        return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  router.post("/password/update", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { username, system } = getUser(req);
      const { newPassword } = AuthValidator.validatePasswordUpdateRequest(req);
      const updatePasswordLoggingEvent = req.logContext
        ? LoggingUtilities.request.branch(req.logContext, "SERVICE", "Updating password")
        : undefined;
      return cr.ok(await svc.updatePassword(`${username}_${system}`, newPassword, updatePasswordLoggingEvent));
    } catch (error) {
      if (error instanceof BaseExceptions)
        return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  return router;
}
