import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { route } from "../utils/requestUtils.js";
import { ConnectivityService } from "./Connectivity.service.js";
import { ConnectivityDto } from "./Connectivity.types.js";

export default function createConnectivityController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new ConnectivityService(db);

  router.get(
    "/",
    route("ConnectivityController.GET /", "Failed to load connectivity stats", async (_req, cr) =>
      cr.ok<ConnectivityDto>(await svc.statistics()),
    ),
  );

  return router;
}
