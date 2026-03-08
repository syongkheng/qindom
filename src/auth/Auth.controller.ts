import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { AuthService } from "./Auth.service";
import { BaseExceptions } from "../exceptions/BaseException";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { AuthValidator } from "./Auth.validator";
import { Exceptions } from "../exceptions/AppExceptions";
import { ITB_AA_USER } from "../models/databases/tb_aa_user";

export default function createAuthController(db: KnexSqlUtilities) {
  const router = Router();
  const authService = new AuthService(db);

  const hasSystemR5 = (roles?: string[]): boolean => roles?.includes("SYSTEM_R5") ?? false;

  // GET /admin/users — list all users (SYSTEM_R5 only)
  router.get("/admin/users", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      if (!hasSystemR5(req.user?.roles)) return response.result(403, "Forbidden", "Insufficient permissions");
      const users = await db.find<ITB_AA_USER>("tb_aa_user", { record_status: "A" }, {
        columns: ["id", "username", "email", "system", "roles", "state", "last_logged_in_dt", "created_dt"],
        orderBy: "created_dt",
        orderDirection: "asc",
      });
      return response.ok(users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        system: u.system,
        roles: (() => { try { return JSON.parse(u.roles || "[]"); } catch { return []; } })(),
        state: u.state,
        lastLoggedInDt: u.last_logged_in_dt,
        createdDt: u.created_dt,
      })));
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  // POST /admin/users/:id/roles — update a user's roles (SYSTEM_R5 only)
  router.post("/admin/users/:id/roles", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      if (!hasSystemR5(req.user?.roles)) return response.result(403, "Forbidden", "Insufficient permissions");
      const id = Number(req.params.id);
      const { roles } = req.body;
      if (!Array.isArray(roles)) return response.badRequest("roles must be an array");
      await db.update<ITB_AA_USER>("tb_aa_user", { id }, { roles: JSON.stringify(roles) });
      return response.ok({ updated: true });
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  // POST /preflight — check if email exists (routes to login or register)
  router.post("/preflight", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { email, system } = AuthValidator.validatePreflightRequest(req);
      return response.ok(await authService.checkIfEmailExistsWithinSystem({ email, system }));
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  // POST /login — authenticate with email + password
  router.post("/login", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { email, password, system } = AuthValidator.validateLoginRequest(req);
      return response.ok(await authService.login({ email, password, system }));
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  // POST /register — create account and send verification email
  router.post("/register", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { username, email, password, system } = AuthValidator.validateRegisterRequest(req);
      return response.ok(await authService.createNewUser({ username, email, password, system }));
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  // POST /verify-email — submit 6-digit OTP, returns JWT on success
  router.post("/verify-email", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { email, system, code } = AuthValidator.validateEmailVerifyRequest(req);
      return response.ok(await authService.verifyEmail({ email, system, code }));
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  // POST /resend-verify — resend a new verification code
  router.post("/resend-verify", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { email, system } = AuthValidator.validatePreflightRequest(req);
      await authService.resendVerifyCode({ email, system });
      // Always respond 200 to avoid leaking whether the email is registered
      return response.ok({ sent: true });
    } catch (error: any) {
      return response.ok({ sent: true }); // intentionally swallow errors
    }
  });

  // POST /verification — validate a JWT token
  router.post("/verification", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { token } = AuthValidator.validateValidateTokenRequest(req);
      const result = await authService.authenticateToken(token);
      return response.ok(result);
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  router.post("/password/validate", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const user = req.user;
      if (!user) throw new Exceptions.UnauthorizedAccess();
      const { password } = AuthValidator.validatePasswordValidateRequest(req);
      const result = await authService.validatePassword(`${user.username}_${user.system}`, password);
      return response.ok(result);
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  router.post("/password/update", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const username = req.user?.username ?? "UNKNOWN";
      const system = req.user?.system ?? "UNKNOWN";
      const { newPassword } = AuthValidator.validatePasswordUpdateRequest(req);
      return response.ok(await authService.updatePassword(`${username}_${system}`, newPassword));
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  return router;
}
