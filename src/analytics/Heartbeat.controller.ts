import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { BaseExceptions } from "../exceptions/BaseException";
import { HeartbeatService } from "./Heartbeat.service";
import { OptionalTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";

export default function createHeartbeatController(db: KnexSqlUtilities) {
  const router = Router();
  const heartbeatService = new HeartbeatService(db);

  router.post("/heartbeat", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const userAgent = req.headers["user-agent"] || "Unknown";
      const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unknown";

      // Use token-derived username if available, else fallback to client-provided username
      const tokenUsername = req.user?.username;
      const { sessionId  } = req.body;

      const heartbeatUsername = tokenUsername ?? "Anonymous";

      if (!sessionId) {
        return response.badRequest("Missing sessionId in request body.");
      }

      await heartbeatService.insertHeartbeatRecord({
        sessionId,
        username: heartbeatUsername,
        ipAddress: JSON.stringify(ipAddress),
        userAgent,
      });

      return response.ok({ message: "Heartbeat recorded successfully." });
    } catch (error: any) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, error.message, error.toResponseMessage());
      }
      return response.ko(error.message);
    }
  });

  return router;
}
