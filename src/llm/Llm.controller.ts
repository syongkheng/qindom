import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { OptionalTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { Exceptions } from "../exceptions/AppExceptions";
import { handleException } from "../utils/requestUtils";

export default function createLlmControllerV1(db: KnexSqlUtilities) {
  const router = Router();

  router.post("/message", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { message } = req.body;
      if (!message) throw new Exceptions.InvalidRequest("message");
      if (typeof message !== "string") throw new Exceptions.InvalidRequest("message must be a string");

      const userAgent = req.headers["user-agent"] || "Unknown";
      const rawIp = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";
      const ipAddress = Array.isArray(rawIp) ? rawIp[0] : rawIp;
      const username = req.user?.username ?? "Anonymous";

      // await svc.insertHeartbeatRecord({ sessionId, username, ipAddress, userAgent });
      return cr.ok({ message: "Message recorded successfully." });
    } catch (err) {
      return handleException(err, cr, "LlmControllerV1.POST /message", "Failed to record message");
    }
  });

  return router;
}
