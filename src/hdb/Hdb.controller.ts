// src/controllers/Hdb.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { HdbService } from "./Hdb.service";
import { CoordinateService } from "./Coordinate.service";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { UnauthorizedAccessException } from "../exceptions/UnauthorizedAccessException";
import { IDecodedTokenUser } from "../token/Token.service";
import { toMessage } from "../utils/errorUtils";

export default function createHdbController(db: KnexSqlUtilities) {
  const router = Router();
  const hdbService = new HdbService(db);
  const coordinateService = new CoordinateService(db);

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
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  router.post("/pphs/update", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);

    try {
      const user = req.user as IDecodedTokenUser;

      if (!user || !user.roles.includes("R5")) {
        throw new UnauthorizedAccessException();
      }
      const { address, lat, lng, formedUrl } = req.body as {
        address: string;
        lat: string;
        lng: string;
        formedUrl: string;
      };
      const result = await coordinateService.updateCoordinates(
        address,
        { lat, lng, formed_url: formedUrl },
        user.username
      );
      return response.ok(result);
    } catch (error) {
      return response.ko(toMessage(error));
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
      return response.ok(await hdbService.retrieveBusstopWithinRadiusOfLatLng(lat, lng, radius));
    } catch (error) {
      return response.ko(toMessage(error));
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
      return response.ok(await hdbService.retrieveNearestMrtStationsOfLatLng(lat, lng, limit));
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  return router;
}
