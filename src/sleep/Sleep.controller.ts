import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { SleepService } from "./Sleep.service";
import { SleepValidator } from "./Sleep.validator";
import { FeatureService } from "../feature/Feature.service";
import { getUser, handleException } from "../utils/requestUtils";

export default function createSleepController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new SleepService(db);
  const featureSvc = new FeatureService(db);

  router.get("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const logs = await svc.getLogs(getUser(req).username, from, to);
      return cr.ok({ logs });
    } catch (err) {
      return handleException(err, cr, "SleepController.GET /", "Failed to load sleep logs");
    }
  });

  router.post("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const body = SleepValidator.validateCreateRequest(req);
      const log = await svc.createLog(getUser(req).username, body);
      return cr.ok({ log });
    } catch (err) {
      return handleException(err, cr, "SleepController.POST /", "Failed to create sleep log");
    }
  });

  router.post("/update", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { id, body } = SleepValidator.validateUpdateRequest(req);
      const updated = await svc.updateLog(getUser(req).username, id, body);
      if (!updated) return cr.result(404, "Not Found", "Log not found");
      return cr.ok({ log: updated });
    } catch (err) {
      return handleException(err, cr, "SleepController.POST /update", "Failed to update sleep log");
    }
  });

  router.post("/delete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { id } = SleepValidator.validateIdRequest(req);
      const deleted = await svc.deleteLog(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Log not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "SleepController.POST /delete", "Failed to delete sleep log");
    }
  });

  router.post("/parse-screenshot", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const user = getUser(req);
      const hasRole = user.roles.includes("SLP_R5") || user.roles.includes("SYSTEM_R5");
      if (!hasRole) return cr.result(403, "Forbidden", "Insufficient permissions");

      const flags = await featureSvc.getAllFlags();
      if (!flags["sleep-screenshot-parsing"]) return cr.result(403, "Forbidden", "Screenshot parsing is not enabled");

      const { image, mimeType, date } = SleepValidator.validateParseScreenshotRequest(req);
      const parsed = await svc.parseScreenshot(image, mimeType, date);
      return cr.ok({ parsed });
    } catch (err) {
      return handleException(err, cr, "SleepController.POST /parse-screenshot", "Failed to parse screenshot");
    }
  });

  router.post("/bulk", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const entries = SleepValidator.validateBulkRequest(req);
      const count = await svc.bulkUpsert(getUser(req).username, entries);
      return cr.ok({ count });
    } catch (err) {
      return handleException(err, cr, "SleepController.POST /bulk", "Failed to bulk import sleep logs");
    }
  });

  return router;
}
