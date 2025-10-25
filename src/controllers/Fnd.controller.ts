// src/controllers/Fnd.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { FndNoticeService } from "../services/Fnd.notice.service";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { FndEventService } from "../services/Fnd.event.service";
import { TokenService } from "../services/Token.service";

export default function createFndController(db: KnexSqlUtilities) {
  const noticeService = new FndNoticeService(db);
  const eventService = new FndEventService(db);
  const tokenService = new TokenService(db);
  const router = Router();

  //  ---- Notices ----
  router.get("/notices", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      if (
        req.headers["authorization"] &&
        typeof req.headers["authorization"] === "string"
      ) {
        const token = req.headers["authorization"].replace("Bearer ", "");
        const userClassification = (await tokenService.decodeToken(token)).role;
        return response.ok(
          await noticeService.getAllNotice(userClassification)
        );
      }
      return response.ok(await noticeService.getAllNotice("OPEN"));
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  router.post(
    "/notices/create",
    [MandatoryTokenFilter],
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
    [MandatoryTokenFilter],
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
    [MandatoryTokenFilter],
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

  router.post(
    "/notices/view",
    [MandatoryTokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const username = req.user?.username ?? "UNKNOWN";
        const { id } = req.body;
        return response.ok(await noticeService.viewNotice(id, username));
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
    [MandatoryTokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const requestUsername = req.user?.username ?? "UNKNOWN";
        const { event_dt, title, content } = req.body;
        return response.ok(
          await eventService.createEvent({
            eventDt: event_dt,
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
    [MandatoryTokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const requestUsername = req.user?.username ?? "UNKNOWN";
        const { id, event_dt, title, content } = req.body;
        return response.ok(
          await eventService.updateEvent({
            id,
            eventDt: event_dt,
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
    [MandatoryTokenFilter],
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

  router.post(
    "/events/view",
    [MandatoryTokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const username = req.user?.username ?? "UNKNOWN";
        const { id } = req.body;
        return response.ok(await eventService.viewEvent(id, username));
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  return router;
}
