// src/controllers/Fnd.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { FndNoticeService } from "../services/Fnd.notice.service";
import { TokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { FndEventService } from "../services/Fnd.event.service";

export default function createFndController(db: KnexSqlUtilities) {
  const noticeService = new FndNoticeService(db);
  const eventService = new FndEventService(db);
  const router = Router();

  //  ---- Notices ----
  router.get("/notices", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      return response.ok(await noticeService.getAllNotice());
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
        return response.ok(
          await noticeService.createNotice({
            type,
            title,
            content,
            classification,
            createdBy: requestUsername,
          })
        );
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
        const { id, type, title, content, classification } = req.body;
        return response.ok(
          await noticeService.updateNotice({
            id,
            type,
            title,
            content,
            classification,
            updatedBy: requestUsername,
          })
        );
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
        return response.ok(await noticeService.deleteNotice(id, username));
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  // ---- Events ----
  router.get("/events", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      return response.ok(await eventService.getAllEvent());
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  router.post(
    "/events/create",
    [TokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const requestUsername = req.user?.username ?? "UNKNOWN";
        const { eventDt, title, content } = req.body;
        return response.ok(
          await eventService.createEvent({
            eventDt,
            title,
            content,
            createdBy: requestUsername,
          })
        );
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  router.post(
    "/events/update",
    [TokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const requestUsername = req.user?.username ?? "UNKNOWN";
        const { id, eventDt, title, content } = req.body;
        return response.ok(
          await eventService.updateEvent({
            id,
            eventDt,
            title,
            content,
            updatedBy: requestUsername,
          })
        );
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  router.post(
    "/events/delete",
    [TokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const requestUsername = req.user?.username ?? "UNKNOWN";
        const { id } = req.body;
        return response.ok(await eventService.deleteEvent(id, requestUsername));
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  return router;
}
