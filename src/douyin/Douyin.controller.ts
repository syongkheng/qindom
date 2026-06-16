import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { DouyinService } from "./Douyin.service.js";
import { DouyinValidator } from "./Douyin.validator.js";
import { handleException } from "../utils/requestUtils.js";

export default function createDouyinController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new DouyinService(db);

  router.get("/live", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { userId } = DouyinValidator.validateLiveStatusRequest(req);
      return cr.ok(await svc.checkLiveStatus(userId));
    } catch (err) {
      return handleException(err, cr, "DouyinController.GET /live", "Failed to check live status");
    }
  });

  router.get("/ranklist", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { roomId, anchorId } = DouyinValidator.validateRankListRequest(req);
      return cr.ok(await svc.getRankList(roomId, anchorId));
    } catch (err) {
      return handleException(err, cr, "DouyinController.GET /ranklist", "Failed to fetch rank list");
    }
  });

  return router;
}
