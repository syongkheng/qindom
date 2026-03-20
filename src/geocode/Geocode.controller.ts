import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { GeocodeService } from "./Geocode.service";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { toMessage } from "../utils/errorUtils";

export default function createGeocodeController(db: KnexSqlUtilities) {
  const router = Router();
  const geocodeService = new GeocodeService(db);

  router.get("/", async (req, res) => {
    const response = new ControllerResponse(res);
    const q = String(req.query.q ?? "").trim();
    if (!q) return response.badRequest("Missing query param: q");
    try {
      const results = await geocodeService.search(q);
      return response.ok(results);
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  return router;
}
