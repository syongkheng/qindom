import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { getUser, handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { HouseLayoutService } from "./HouseLayout.service.js";
import { HouseLayoutValidator } from "./HouseLayout.validator.js";

// Authenticated CRUD for saved house-planner layouts (the planner itself works logged out via localStorage).
export default function createHouseLayoutController(db: KnexSqlUtilities) {
  const router = Router();
  const service = new HouseLayoutService(db);

  const validationEvent = (logContext?: IRequestLogContext) =>
    logContext ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body") : undefined;

  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.list(getUser(req).id));
    } catch (err) {
      return handleException(err, cr, "HouseLayoutController.GET /", "Failed to load layouts");
    }
  });

  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const input = HouseLayoutValidator.validateCreateRequest(req.body, validationEvent(req.logContext));
      return cr.ok(await service.create(getUser(req).id, input));
    } catch (err) {
      return handleException(err, cr, "HouseLayoutController.POST /", "Failed to save layout");
    }
  });

  router.get("/:layoutId", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.get(getUser(req).id, req.params.layoutId));
    } catch (err) {
      return handleException(err, cr, "HouseLayoutController.GET /:layoutId", "Failed to load layout");
    }
  });

  router.post("/:layoutId/update", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const input = HouseLayoutValidator.validateUpdateRequest(req.body, validationEvent(req.logContext));
      return cr.ok(await service.update(getUser(req).id, req.params.layoutId, input));
    } catch (err) {
      return handleException(err, cr, "HouseLayoutController.POST /:layoutId/update", "Failed to update layout");
    }
  });

  router.post("/:layoutId/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      return cr.ok(await service.delete(getUser(req).id, req.params.layoutId));
    } catch (err) {
      return handleException(err, cr, "HouseLayoutController.POST /:layoutId/delete", "Failed to delete layout");
    }
  });

  return router;
}
