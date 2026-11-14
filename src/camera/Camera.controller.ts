import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import {
  cameraClaimIpLimiter,
  cameraClaimUserLimiter,
  cameraRegisterLimiter,
} from "../middlewares/RateLimiter.js";
import { CameraService } from "./Camera.service.js";
import { CameraValidator } from "./Camera.validator.js";

// Mounted at /camera with mw.std. Phone registration is unauthenticated (the phone has
// no user); everything else needs the dashboard user's session.
export default function createCameraController(service: CameraService) {
  const router = Router();

  router.post("/device/register", [cameraRegisterLimiter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.register(CameraValidator.validateRegister(req.body ?? {})));
    } catch (err) {
      return handleException(err, cr, "CameraController.POST /device/register", "Failed to register device");
    }
  });

  router.post(
    "/device/claim",
    [cameraClaimIpLimiter, MandatoryTokenFilter, cameraClaimUserLimiter],
    async (req: RequestWithUserInfo, res: Response) => {
      const cr = new ControllerResponse(req, res);
      try {
        const body = CameraValidator.validateClaim(req.body ?? {});
        return cr.ok(await service.claim(getUser(req).id, body));
      } catch (err) {
        return handleException(err, cr, "CameraController.POST /device/claim", "Failed to add phone");
      }
    },
  );

  router.get("/device", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.list(getUser(req).id));
    } catch (err) {
      return handleException(err, cr, "CameraController.GET /device", "Failed to load phones");
    }
  });

  router.post("/device/:deviceId/delete", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const deviceId = CameraValidator.validateDeviceId(req.params.deviceId);
      return cr.ok(await service.remove(getUser(req).id, deviceId));
    } catch (err) {
      return handleException(err, cr, "CameraController.POST /device/:deviceId/delete", "Failed to remove phone");
    }
  });

  return router;
}
