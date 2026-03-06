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
        columns: ["id", "username", "system", "roles", "state", "last_logged_in_dt", "created_dt"],
        orderBy: "created_dt",
        orderDirection: "asc",
      });
      return response.ok(users.map((u) => ({
        id: u.id,
        username: u.username,
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

  router.post("/preflight", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { username, system } = AuthValidator.validatePreflightRequest(req);
      return response.ok(await authService.checkIfUsernameExistsWithinSystem({ username, system }));
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  router.post("/login", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { username, password, system } = AuthValidator.validateLoginRequest(req);
      return response.ok(await authService.login({ username, password, system }));
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  router.post("/register", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { username, password, system, role } = AuthValidator.validateRegisterRequest(req);
      return response.ok(await authService.createNewUser({ username, password, system, role }));
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

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

      if (!user) {
        throw new Exceptions.UnauthorizedAccess();
      }

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
