import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { HdbService } from "./Hdb.service";
import { CoordinateService } from "./Coordinate.service";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { Exceptions } from "../exceptions/AppExceptions";
import { getUser, handleException, hasRole } from "../utils/requestUtils";

export default function createHdbController(db: KnexSqlUtilities) {
  const router = Router();
  const hdbSvc        = new HdbService(db);
  const coordinateSvc = new CoordinateService(db);

  router.post("/pphs", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { batch } = req.body as { batch: string };
      return cr.ok(await hdbSvc.retrieveListOfPphsWithCoordinates(batch));
    } catch (err) {
      return handleException(err, cr, "HdbController.POST /pphs", "Failed to fetch PPHS");
    }
  });

  router.post("/pphs/update", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const user = getUser(req);
      if (!hasRole(req, "PPHS_R5", "SYSTEM_R5")) throw new Exceptions.UnauthorizedAccess();
      const { address, lat, lng, formedUrl } = req.body as {
        address: string; lat: string; lng: string; formedUrl: string;
      };
      return cr.ok(await coordinateSvc.updateCoordinates(address, { lat, lng, formed_url: formedUrl }, user.username));
    } catch (err) {
      return handleException(err, cr, "HdbController.POST /pphs/update", "Failed to update coordinates");
    }
  });

  router.post("/pphs/clear-coordinates", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      if (!hasRole(req, "PPHS_R5", "SYSTEM_R5")) throw new Exceptions.UnauthorizedAccess();
      const { address } = req.body as { address: string };
      await hdbSvc.clearCoordinatesOfAddress(address);
      return cr.ok(true);
    } catch (err) {
      return handleException(err, cr, "HdbController.POST /pphs/clear-coordinates", "Failed to clear coordinates");
    }
  });

  router.post("/pphs/geocode-options", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { address } = req.body as { address: string };
      return cr.ok(await hdbSvc.getAllCoordinateOptions(address));
    } catch (err) {
      return handleException(err, cr, "HdbController.POST /pphs/geocode-options", "Failed to fetch coordinate options");
    }
  });

  router.post("/pphs/refresh", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { address } = req.body as { address: string };
      return cr.ok(await hdbSvc.refreshCoordinatesOfAddress(address));
    } catch (err) {
      return handleException(err, cr, "HdbController.POST /pphs/refresh", "Failed to refresh coordinates");
    }
  });

  router.post("/pphs/busstops", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { lat, lng, radius } = req.body as { lat: string; lng: string; radius: number };
      return cr.ok(await hdbSvc.retrieveBusstopWithinRadiusOfLatLng(lat, lng, radius));
    } catch (err) {
      return handleException(err, cr, "HdbController.POST /pphs/busstops", "Failed to fetch bus stops");
    }
  });

  router.post("/pphs/mrt", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { lat, lng, limit } = req.body as { lat: string; lng: string; limit?: number };
      return cr.ok(await hdbSvc.retrieveNearestMrtStationsOfLatLng(lat, lng, limit));
    } catch (err) {
      return handleException(err, cr, "HdbController.POST /pphs/mrt", "Failed to fetch MRT stations");
    }
  });

  return router;
}
