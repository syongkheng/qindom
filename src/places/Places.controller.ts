import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { PlacesService } from "./Places.service.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { handleException } from "../utils/requestUtils.js";

export default function createPlacesController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new PlacesService(db);

  // GET /api/places?destination=Singapore
  router.get("/", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const destination = String(req.query.destination ?? "").trim();
      if (!destination) throw new Exceptions.InvalidRequest("destination");
      return cr.ok(await svc.findNearby(destination));
    } catch (err) {
      return handleException(err, cr, "PlacesController.GET /", "Failed to fetch nearby places");
    }
  });

  return router;
}
