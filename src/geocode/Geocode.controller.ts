import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { route } from "../utils/RequestUtilities.js";
import { GeocodeService } from "./Geocode.service.js";
import { NominatimPlaceDto } from "./Geocode.types.js";
import { validateGeocodeQuery } from "./Geocode.validator.js";

export default function createGeocodeController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new GeocodeService(db);

  router.get(
    "/",
    route("GeocodeController.GET /", "Failed to geocode", async (req, cr) => {
      const q = validateGeocodeQuery(req.query.q);
      return cr.ok<NominatimPlaceDto[]>(await svc.search(q, req.logContext));
    }),
  );

  return router;
}
