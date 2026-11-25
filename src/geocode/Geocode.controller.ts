import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { route } from "../utils/requestUtils.js";
import { GeocodeService } from "./Geocode.service.js";
import { NominatimPlaceDto } from "./Geocode.types.js";

const MAX_QUERY_LENGTH = 200;

export default function createGeocodeController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new GeocodeService(db);

  router.get(
    "/",
    route("GeocodeController.GET /", "Failed to geocode", async (req, cr) => {
      const q = String(req.query.q ?? "").trim();
      if (!q || q.length > MAX_QUERY_LENGTH) throw new Exceptions.InvalidRequest("q", "format");
      return cr.ok<NominatimPlaceDto[]>(await svc.search(q, req.logContext));
    }),
  );

  return router;
}
