import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { handleException } from "../utils/requestUtils.js";
import { IotService } from "./Iot.service.js";

export default function createIotController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new IotService(db);

  function resolveIp(req: RequestWithUserInfo): string {
    const raw = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";
    return Array.isArray(raw) ? raw[0] : raw;
  }

  // POST /iot — device heartbeat/connectivity proof, upserted by deviceId.
  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { deviceId, deviceName } = req.body;
      if (!deviceId) throw new Exceptions.InvalidRequest("deviceId");

      const result = await svc.recordHeartbeat({
        deviceId,
        deviceName,
        ipAddress: resolveIp(req),
        userAgent: req.headers["user-agent"] || "Unknown",
      });
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "IotController.POST /", "Failed to record device heartbeat");
    }
  });

  // GET /iot?deviceId=... — last known status for a device.
  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const deviceId = req.query.deviceId as string;
      if (!deviceId) throw new Exceptions.InvalidRequest("deviceId");

      const record = await svc.getHeartbeat(deviceId);
      if (!record) throw new Exceptions.NotFound();

      return cr.ok(record);
    } catch (err) {
      return handleException(err, cr, "IotController.GET /", "Failed to load device status");
    }
  });

  return router;
}
