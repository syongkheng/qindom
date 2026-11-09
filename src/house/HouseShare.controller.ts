import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { HouseShareService } from "./HouseShare.service.js";
import { HouseLayoutValidator } from "./HouseLayout.validator.js";

const validationEvent = (logContext?: IRequestLogContext) =>
  logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body") : undefined;

// Authenticated: make, list and revoke the caller's own share links.
export function createHouseShareController(db: KnexSqlUtilities) {
  const router = Router();
  const service = new HouseShareService(db);

  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.list(getUser(req).id));
    } catch (err) {
      return handleException(err, cr, "HouseShareController.GET /", "Failed to load share links");
    }
  });

  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const input = HouseLayoutValidator.validateCreateRequest(req.body, validationEvent(req.logContext));
      return cr.ok(await service.create(getUser(req).id, input));
    } catch (err) {
      return handleException(err, cr, "HouseShareController.POST /", "Failed to create share link");
    }
  });

  router.post("/:token/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.revoke(getUser(req).id, req.params.token));
    } catch (err) {
      return handleException(err, cr, "HouseShareController.POST /:token/delete", "Failed to revoke share link");
    }
  });

  return router;
}

// Public: anyone with the link can read that one snapshot (rate limited by IP).
export function createHouseShareViewController(db: KnexSqlUtilities) {
  const router = Router();
  const service = new HouseShareService(db);

  router.get("/:token", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.view(req.params.token));
    } catch (err) {
      return handleException(err, cr, "HouseShareViewController.GET /:token", "Failed to load shared house");
    }
  });

  return router;
}
