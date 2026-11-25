import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { HouseLayoutService } from "./HouseLayout.service.js";
import { validateLayoutBody, validateLayoutUpdateBody } from "./House.validator.js";
import { HouseDeletedDto, HouseLayoutDto, HouseLayoutListDto, HouseLayoutSummaryDto } from "./House.types.js";

/** Saved house-planner layouts (mounted under `mw.auth`). */
export default function createHouseLayoutController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new HouseLayoutService(db);

  router.get(
    "/",
    route("HouseLayoutController.GET /", "Failed to load layouts", async (req, cr) =>
      cr.ok<HouseLayoutListDto>(await svc.list(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/",
    route("HouseLayoutController.POST /", "Failed to save layout", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateLayoutBody(req.body, event);
      return cr.ok<HouseLayoutSummaryDto>(await svc.create(getUser(req).id, body, req.logContext));
    }),
  );

  router.get(
    "/:layoutId",
    route("HouseLayoutController.GET /:layoutId", "Failed to load layout", async (req, cr) =>
      cr.ok<HouseLayoutDto>(await svc.get(getUser(req).id, req.params.layoutId, req.logContext)),
    ),
  );

  router.post(
    "/:layoutId/update",
    route("HouseLayoutController.POST /:layoutId/update", "Failed to update layout", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateLayoutUpdateBody(req.body, event);
      return cr.ok<HouseLayoutSummaryDto>(await svc.update(getUser(req).id, req.params.layoutId, body, req.logContext));
    }),
  );

  router.post(
    "/:layoutId/delete",
    route("HouseLayoutController.POST /:layoutId/delete", "Failed to delete layout", async (req, cr) =>
      cr.ok<HouseDeletedDto>(await svc.delete(getUser(req).id, req.params.layoutId, req.logContext)),
    ),
  );

  return router;
}
