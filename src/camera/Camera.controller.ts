import { Router } from "express";
import { getUser, route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import { cameraClaimIpLimiter, cameraClaimUserLimiter, cameraRegisterLimiter } from "../middlewares/RateLimiter.js";
import { CameraService } from "./Camera.service.js";
import { validateClaimBody, validateDeviceIdParam, validateRegisterBody } from "./Camera.validator.js";
import { CameraDeviceDto, CameraDeviceRemovedDto, CameraRegisterDto } from "./Camera.types.js";

/**
 * Mounted at /camera with `mw.std`. Phone registration is unauthenticated (the phone has no
 * user), so the JWT filter is per route on everything else. The WebSockets are in Camera.ws.ts.
 */
export default function createCameraController(service: CameraService): Router {
  const router = Router();

  router.post(
    "/device/register",
    cameraRegisterLimiter,
    route("CameraController.POST /device/register", "Failed to register device", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateRegisterBody(req.body ?? {}, event);
      return cr.ok<CameraRegisterDto>(await service.register(body, req.logContext));
    }),
  );

  // IP limiter before the JWT filter (anonymous guessing), user limiter after it (rotating IPs).
  router.post(
    "/device/claim",
    cameraClaimIpLimiter,
    MandatoryTokenFilter,
    cameraClaimUserLimiter,
    route("CameraController.POST /device/claim", "Failed to add phone", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateClaimBody(req.body ?? {}, event);
      return cr.ok<CameraDeviceDto>(await service.claim(getUser(req).id, body, req.logContext));
    }),
  );

  router.get(
    "/device",
    MandatoryTokenFilter,
    route("CameraController.GET /device", "Failed to load phones", async (req, cr) =>
      cr.ok<CameraDeviceDto[]>(await service.list(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/device/:deviceId/delete",
    MandatoryTokenFilter,
    route("CameraController.POST /device/:deviceId/delete", "Failed to remove phone", async (req, cr) => {
      const deviceId = validateDeviceIdParam(req.params.deviceId);
      return cr.ok<CameraDeviceRemovedDto>(await service.remove(getUser(req).id, deviceId, req.logContext));
    }),
  );

  return router;
}
