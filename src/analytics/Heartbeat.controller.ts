import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { HeartbeatService } from "./Heartbeat.service.js";
import { OptionalTokenFilter } from "../middlewares/TokenFilter.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { handleException } from "../utils/requestUtils.js";

export default function createHeartbeatController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new HeartbeatService(db);

  router.post("/heartbeat", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { sessionId } = req.body;
      if (!sessionId) throw new Exceptions.InvalidRequest("sessionId");

      const userAgent  = req.headers["user-agent"] || "Unknown";
      const rawIp      = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";
      const ipAddress  = Array.isArray(rawIp) ? rawIp[0] : rawIp;
      const username   = req.user?.username ?? "Anonymous";

      await svc.insertHeartbeatRecord({ sessionId, username, ipAddress, userAgent });
      return cr.ok({ message: "Heartbeat recorded successfully." });
    } catch (err) {
      return handleException(err, cr, "HeartbeatController.POST /heartbeat", "Failed to record heartbeat");
    }
  });

  return router;
}
