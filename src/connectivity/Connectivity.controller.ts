import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ConnectivityService } from "./Connectivity.service.js";
import { handleException } from "../utils/requestUtils.js";

export default function createConnectivityController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new ConnectivityService(db);

  router.get("/", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await svc.statistics());
    } catch (err) {
      return handleException(err, cr, "ConnectivityController.GET /", "Failed to load connectivity stats");
    }
  });

  return router;
}
