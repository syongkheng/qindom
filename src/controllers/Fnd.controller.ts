// src/controllers/Fnd.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { FndNoticeService } from "../services/Fnd.notice.service";
import { TokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";

export default function createFndController(db: KnexSqlUtilities) {
  const noticeService = new FndNoticeService(db);
  const router = Router();

  router.get("/notices", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const result = await noticeService.getAllNotice();
      return response.ok(result);
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  router.post(
    "/notices/create",
    [TokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const requestUsername = req.user?.username ?? "UNKNOWN";
        const { type, title, content, classification } = req.body;
        const result = await noticeService.createNotice({
          type,
          title,
          content,
          classification,
          createdBy: requestUsername,
        });
        return response.ok(result);
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  router.post(
    "/notices/update",
    [TokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const requestUsername = req.user?.username ?? "UNKNOWN";
        const { id, type, title, content, classification, updatedBy } =
          req.body;
        const result = await noticeService.updateNotice({
          id,
          type,
          title,
          content,
          classification,
          updatedBy: requestUsername,
        });
        return response.ok(result);
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  router.post(
    "/notices/delete",
    [TokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const username = req.user?.username ?? "UNKNOWN";
        const { id } = req.body;
        const result = await noticeService.deleteNotice(id, username);
        return response.ok(result);
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  return router;
}
