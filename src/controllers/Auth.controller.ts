import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { AuthService } from "../services/Auth.service";
import { BaseExceptions } from "../exceptions/BaseException";

export default function createAuthController(db: KnexSqlUtilities) {
  const router = Router();
  const authService = new AuthService(db);

  /**
   * Step to determine whether identity exists and to proceed to register or to login
   */
  router.post("/preflight", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { username, system } = req.body;

      if (!username || typeof username !== "string") {
        response.badRequest("Invalid field - [username]");
      }
      if (!system || typeof system !== "string" || system !== "fnd") {
        response.badRequest("Invalid field - [system]");
      }
      const result = await authService.checkIfUsernameExistsWithinSystem({
        username,
        system,
      });
      return response.ok(result);
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(
          error.httpStatus,
          error.message,
          error.toResponseMessage()
        );
      }
      return response.ko(error.message);
    }
  });

  router.post("/login", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { username, password, system } = req.body;
      if (!username || typeof username !== "string") {
        response.badRequest("Invalid field - [username]");
      }

      if (!password || typeof password !== "string") {
        response.badRequest("Invalid field - [password]");
      }
      if (!system || typeof system !== "string" || system !== "fnd") {
        response.badRequest("Invalid field - [system]");
      }
      const result = await authService.login({ username, password, system });
      return response.ok(result);
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(
          error.httpStatus,
          error.message,
          error.toResponseMessage()
        );
      }
      return response.ko(error.message);
    }
  });

  router.post("/register", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { username, password, system, role } = req.body;

      if (!username || typeof username !== "string") {
        response.badRequest("Invalid field - [username]");
      }

      if (!password || typeof password !== "string") {
        response.badRequest("Invalid field - [password]");
      }
      if (!system || typeof system !== "string" || system !== "fnd") {
        response.badRequest("Invalid field - [system]");
      }
      if (!role || typeof role !== "string") {
        response.badRequest("Invalid field - [role]");
      }
      const result = await authService.createNewUser({
        username,
        password,
        system,
        role,
      });
      return response.ok(result);
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(
          error.httpStatus,
          error.message,
          error.toResponseMessage()
        );
      }
      return response.ko(error.message);
    }
  });

  router.post("/verification", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { token } = req.body;
      const result = await authService.authenticateToken(token);
      return response.ok(result);
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(
          error.httpStatus,
          error.message,
          error.toResponseMessage()
        );
      }
      return response.ko(error.message);
    }
  });

  return router;
}
