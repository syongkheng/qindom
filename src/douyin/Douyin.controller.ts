import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { DouyinService } from "./Douyin.service";
import { toMessage } from "../utils/errorUtils";

export default function createDouyinController(db: KnexSqlUtilities) {
  const router = Router();
  const douyinService = new DouyinService(db);

  /**
   * Checks if a Douyin user is currently livestreaming.
   * @route GET /douyin/live?userId={userId}
   * @param {string} userId.query.required - The Douyin user ID
   * @returns {ControllerResponse} 200 - Live status result
   * @returns {ControllerResponse} 400 - Bad request, missing userId
   * @returns {ControllerResponse} 500 - Internal server error
   */
  router.get("/live", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);

    try {
      const { userId } = req.query;

      if (!userId || typeof userId !== "string" || !userId.trim()) {
        return response.badRequest("[userId] is required");
      }

      const result = await douyinService.checkLiveStatus(userId.trim());
      return response.ok(result);
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  /**
   * Fetches the audience rank list for an active Douyin live room.
   * @route GET /douyin/ranklist?roomId={roomId}&anchorId={anchorId}
   */
  router.get("/ranklist", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);

    try {
      const { roomId, anchorId } = req.query;

      if (!roomId || typeof roomId !== "string" || !roomId.trim()) {
        return response.badRequest("[roomId] is required");
      }
      if (!anchorId || typeof anchorId !== "string" || !anchorId.trim()) {
        return response.badRequest("[anchorId] is required");
      }

      const result = await douyinService.getRankList(roomId.trim(), anchorId.trim());
      return response.ok(result);
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  return router;
}
