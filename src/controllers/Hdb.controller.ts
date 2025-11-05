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
  router.post("/pphs", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);

    try {
      const { batch } = req.body as { batch: string };
      const result = await hdbService.retrieveListOfPphsWithCoordinates(batch);
      return response.ok(result);
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  router.post("/pphs/busstops", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);

    try {
      const { lat, lng, radius } = req.body as {
        lat: string;
        lng: string;
        radius: number;
      };
      return response.ok(
        await hdbService.retrieveBusstopWithinRadiusOfLatLng(lat, lng, radius)
      );
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  router.post("/pphs/mrt", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { lat, lng, limit } = req.body as {
        lat: string;
        lng: string;
        limit?: number;
      };
      return response.ok(
        await hdbService.retrieveNearestMrtStationsOfLatLng(lat, lng)
      );
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  return router;
}
