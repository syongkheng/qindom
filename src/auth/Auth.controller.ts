import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { AuthService } from "./Auth.service";
import { BaseExceptions } from "../exceptions/BaseException";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { loginLimiter, registerLimiter, verifyEmailLimiter, resendVerifyLimiter } from "../middlewares/RateLimiter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { AuthValidator } from "./Auth.validator";
import { Exceptions } from "../exceptions/AppExceptions";
import { ITB_AA_USER } from "../models/databases/tb_aa_user";
import { toMessage } from "../utils/errorUtils";
import { getUser, handleException } from "../utils/requestUtils";

export default function createAuthController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new AuthService(db);

  const hasSystemR5 = (roles?: string[]): boolean => roles?.includes("SYSTEM_R5") ?? false;

  // GET /admin/users — list all users (SYSTEM_R5 only)
  router.get("/admin/users", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      if (!hasSystemR5(getUser(req).roles)) return cr.result(403, "Forbidden", "Insufficient permissions");
      const users = await db.find<ITB_AA_USER>("tb_aa_user", { record_status: "A" }, {
        columns: ["id", "username", "email", "system", "roles", "state", "last_logged_in_dt", "created_dt"],
        orderBy: "created_dt",
        orderDirection: "asc",
      });
      return cr.ok(users.map((u) => ({
        id:            u.id,
        username:      u.username,
        email:         u.email,
        system:        u.system,
        roles:         (() => { try { return JSON.parse(u.roles || "[]"); } catch { return []; } })(),
        state:         u.state,
        lastLoggedInDt: u.last_logged_in_dt,
        createdDt:     u.created_dt,
      })));
    } catch (err) {
      return handleException(err, cr, "AuthController.GET /admin/users", "Failed to load users");
    }
  });

  // POST /admin/users/:id/roles — update a user's roles (SYSTEM_R5 only)
  router.post("/admin/users/:id/roles", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      if (!hasSystemR5(getUser(req).roles)) return cr.result(403, "Forbidden", "Insufficient permissions");
      const id = Number(req.params.id);
      const { roles } = req.body;
      if (!Array.isArray(roles)) throw new Exceptions.InvalidRequest("roles");
      await db.update<ITB_AA_USER>("tb_aa_user", { id }, { roles: JSON.stringify(roles) });
      return cr.ok({ updated: true });
    } catch (err) {
      return handleException(err, cr, "AuthController.POST /admin/users/:id/roles", "Failed to update roles");
    }
  });

  // POST /preflight — check if email exists (routes to login or register)
  router.post("/preflight", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { email, system } = AuthValidator.validatePreflightRequest(req);
      return cr.ok(await svc.checkIfEmailExistsWithinSystem({ email, system }));
    } catch (error) {
      if (error instanceof BaseExceptions) return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  // POST /login — authenticate with email + password
  router.post("/login", [loginLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { email, password, system } = AuthValidator.validateLoginRequest(req);
      return cr.ok(await svc.login({ email, password, system }));
    } catch (error) {
      if (error instanceof BaseExceptions) return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  // POST /register — create account and send verification email
  router.post("/register", [registerLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { username, email, password, system } = AuthValidator.validateRegisterRequest(req);
      return cr.ok(await svc.createNewUser({ username, email, password, system }));
    } catch (error) {
      if (error instanceof BaseExceptions) return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  // POST /verify-email — submit 6-digit OTP, returns JWT on success
  router.post("/verify-email", [verifyEmailLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { email, system, code } = AuthValidator.validateEmailVerifyRequest(req);
      return cr.ok(await svc.verifyEmail({ email, system, code }));
    } catch (error) {
      if (error instanceof BaseExceptions) return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  // POST /resend-verify — resend a new verification code
  router.post("/resend-verify", [resendVerifyLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { email, system } = AuthValidator.validatePreflightRequest(req);
      await svc.resendVerifyCode({ email, system });
      return cr.ok({ sent: true }); // Always respond 200 to avoid leaking whether the email is registered
    } catch {
      return cr.ok({ sent: true }); // intentionally swallow errors
    }
  });

  // POST /verification — validate a JWT token
  router.post("/verification", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { token } = AuthValidator.validateValidateTokenRequest(req);
      return cr.ok(await svc.authenticateToken(token));
    } catch (error) {
      if (error instanceof BaseExceptions) return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  router.post("/password/validate", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { username, system } = getUser(req);
      const { password } = AuthValidator.validatePasswordValidateRequest(req);
      return cr.ok(await svc.validatePassword(`${username}_${system}`, password));
    } catch (error) {
      if (error instanceof BaseExceptions) return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  router.post("/password/update", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { username, system } = getUser(req);
      const { newPassword } = AuthValidator.validatePasswordUpdateRequest(req);
      return cr.ok(await svc.updatePassword(`${username}_${system}`, newPassword));
    } catch (error) {
      if (error instanceof BaseExceptions) return cr.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      return cr.ko(toMessage(error));
    }
  });

  return router;
}
