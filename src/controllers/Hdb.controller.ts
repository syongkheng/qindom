// src/controllers/Hdb.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { HdbService } from "../services/Hdb.service";

export default function createHdbController(db: KnexSqlUtilities) {
  const router = Router();
  const hdbService = new HdbService(db);

  /**
   * Gets a list of PPHS with coordinates, based on the current MMYYYY.
   * @route GET /hdb
   * @returns {ControllerResponse} 200 - An array of PPHS with coordinates
   * @returns {ControllerResponse} 500 - Internal server error
   */
  router.get("/", async (_req: Request, res: Response) => {
    const response = new ControllerResponse(res);

    try {
      const result = await hdbService.retrieveListOfPphsWithCoordinates();
      return response.ok(result);
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  return router;
}
