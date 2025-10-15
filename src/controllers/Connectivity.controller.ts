// src/controllers/Connectivity.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ConnectivityService } from "../services/Connectivity.service";

export default function createConnectivityController(db: KnexSqlUtilities) {
  const router = Router();
  const connectivityService = new ConnectivityService(db);

  /**
   * route GET /connectivity
   * @returns {ControllerResponse} 200 - An object containing connectivity statistics
   * @returns {ControllerResponse} 500 - Internal server error
   */
  router.get("/", async (_req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const stats = await connectivityService.statistics();
      return response.ok(stats);
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  return router;
}
