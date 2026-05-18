import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { FeatureService } from "./Feature.service";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { Exceptions } from "../exceptions/AppExceptions";
import { getUser, handleException, hasRole } from "../utils/requestUtils";

export default function createFeatureController(db: KnexSqlUtilities) {
  const router = Router();
  const svc = new FeatureService(db);

  router.get("/", async (req: Request, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await svc.getAllFlags());
    } catch (err) {
      return handleException(err, cr, "FeatureController.GET /", "Failed to load feature flags");
    }
  });

  router.get("/admin", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      if (!hasRole(req, "SYSTEM_R5")) throw new Exceptions.UnauthorizedAccess();
      return cr.ok(await svc.getAllFlagsAdmin());
    } catch (err) {
      return handleException(err, cr, "FeatureController.GET /admin", "Failed to load feature flags");
    }
  });

  router.post("/create", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const user = getUser(req);
      if (!hasRole(req, "SYSTEM_R5")) throw new Exceptions.UnauthorizedAccess();
      const { key, label, remarks } = req.body;
      if (!key || typeof key !== "string" || !key.trim()) throw new Exceptions.InvalidRequest("key");
      if (!label || typeof label !== "string" || !label.trim()) throw new Exceptions.InvalidRequest("label");
      const flag = await svc.createFlag({ key: key.trim(), label: label.trim(), remarks: remarks || null }, user.username);
      return cr.ok(flag);
    } catch (err) {
      return handleException(err, cr, "FeatureController.POST /create", "Failed to create feature flag");
    }
  });

  router.post("/:key/update", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const user = getUser(req);
      if (!hasRole(req, "SYSTEM_R5")) throw new Exceptions.UnauthorizedAccess();
      const { label, remarks } = req.body;
      await svc.updateFlag(req.params.key, { label, remarks: remarks || null }, user.username);
      return cr.ok({ updated: true });
    } catch (err) {
      return handleException(err, cr, "FeatureController.POST /:key/update", "Failed to update feature flag");
    }
  });

  router.post("/:key/toggle", [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const user = getUser(req);
      if (!hasRole(req, "SYSTEM_R5")) throw new Exceptions.UnauthorizedAccess();
      return cr.ok(await svc.toggleFlag(req.params.key, user.username));
    } catch (err) {
      return handleException(err, cr, "FeatureController.POST /:key/toggle", "Failed to toggle feature flag");
    }
  });

  return router;
}
