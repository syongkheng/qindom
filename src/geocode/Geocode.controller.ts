import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { GeocodeService } from "./Geocode.service.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { handleException } from "../utils/requestUtils.js";

export default function createGeocodeController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new GeocodeService(db);

  router.get("/", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) throw new Exceptions.InvalidRequest("q");
      return cr.ok(await svc.search(q));
    } catch (err) {
      return handleException(err, cr, "GeocodeController.GET /", "Failed to geocode");
    }
  });

  return router;
}
