import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { ScenicService } from "./Scenic.service";
import { getUser, handleException } from "../utils/requestUtils";

export default function createScenicController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new ScenicService(db);

  // GET /api/scenic — public, returns full list of 5A scenic spots
  router.get("/", async (_req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const spots = await svc.getAll();
      return cr.ok({ spots });
    } catch (err) {
      return handleException(err, cr, "ScenicController.GET /", "Failed to load scenic spots");
    }
  });

  // GET /api/scenic/checklist — auth required, returns user's visited scenic IDs
  router.get("/checklist", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const checklist = await svc.getUserChecklist(getUser(req).username);
      return cr.ok({ checklist });
    } catch (err) {
      return handleException(err, cr, "ScenicController.GET /checklist", "Failed to load checklist");
    }
  });

  // POST /api/scenic/checklist — auth required, upsert a check { scenicId, visited }
  router.post("/checklist", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { scenicId, visited } = req.body;
      if (typeof scenicId !== "number" || typeof visited !== "boolean") {
        return cr.badRequest("Invalid request: scenicId (number) and visited (boolean) are required");
      }
      await svc.upsertCheck(getUser(req).username, scenicId, visited);
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "ScenicController.POST /checklist", "Failed to update checklist");
    }
  });

  return router;
}
