import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ConnectivityService } from "./Connectivity.service";
import { handleException } from "../utils/requestUtils";

export default function createConnectivityController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new ConnectivityService(db);

  router.get("/", async (_req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      return cr.ok(await svc.statistics());
    } catch (err) {
      return handleException(err, cr, "ConnectivityController.GET /", "Failed to load connectivity stats");
    }
  });

  return router;
}
