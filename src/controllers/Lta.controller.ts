// src/controllers/Lta.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LtaService } from "../services/Lta.service";

export default function createLtaController(db: KnexSqlUtilities) {
  const router = Router();
  const ltaService = new LtaService(db);

  /**
   * Gets bus arrival timings for a specific bus stop code.
   * @route GET /lta/timing?busStopCode={busStopCode}
   * @param {string} busStopCode.query.required - The bus stop code to retrieve timings for
   * @returns {ControllerResponse} 200 - An array of bus arrival timings
   * @returns {ControllerResponse} 400 - Bad request, missing or invalid parameters
   * @returns {ControllerResponse} 500 - Internal server error
   */
  router.get("/timing", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);

    try {
      const { busStopCode } = req.query;

      if (!busStopCode) {
        return response.ko("[busStopCode] is required");
      }

      const result = await ltaService.statistics(busStopCode as string);
      return response.ok(result);
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  return router;
}
