import { Router, Request, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { BaseExceptions } from "../exceptions/BaseException";
import { HeartbeatService } from "./Heartbeat.service";
import { OptionalTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { toMessage } from "../utils/errorUtils";

export default function createHeartbeatController(db: KnexSqlUtilities) {
  const router = Router();
  const heartbeatService = new HeartbeatService(db);

  router.post("/heartbeat", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const userAgent = req.headers["user-agent"] || "Unknown";
      const rawIp = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";
      const ipAddress = Array.isArray(rawIp) ? rawIp[0] : rawIp;

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
        ipAddress,
        userAgent,
      });

      return response.ok({ message: "Heartbeat recorded successfully." });
    } catch (error) {
      if (error instanceof BaseExceptions) {
        return response.result(error.httpStatus, toMessage(error), error.toResponseMessage());
      }
      return response.ko(toMessage(error));
    }
  });

  return router;
}
