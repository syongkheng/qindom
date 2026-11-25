import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { HouseShareService } from "./HouseShare.service.js";
import { validateLayoutBody } from "./House.validator.js";
import { HouseDeletedDto, HouseShareListDto, HouseShareSummaryDto, HouseShareViewDto } from "./House.types.js";

/** Owner side of share links (mounted at `/house/share` under `mw.auth`): create, list, revoke. */
export function createHouseShareController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new HouseShareService(db);

  router.get(
    "/",
    route("HouseShareController.GET /", "Failed to load share links", async (req, cr) =>
      cr.ok<HouseShareListDto>(await svc.list(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/",
    route("HouseShareController.POST /", "Failed to create share link", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateLayoutBody(req.body, event);
      return cr.ok<HouseShareSummaryDto>(await svc.create(getUser(req).id, body, req.logContext));
    }),
  );

  router.post(
    "/:token/delete",
    route("HouseShareController.POST /:token/delete", "Failed to revoke share link", async (req, cr) =>
      cr.ok<HouseDeletedDto>(await svc.revoke(getUser(req).id, req.params.token, req.logContext)),
    ),
  );

  return router;
}

/** Public side (mounted at `/house/view` under `mw.housePublic`, 60/min/IP): anyone with the link reads that one snapshot. */
export function createHouseShareViewController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new HouseShareService(db);

  router.get(
    "/:token",
    route("HouseShareViewController.GET /:token", "Failed to load shared house", async (req, cr) =>
      cr.ok<HouseShareViewDto>(await svc.view(req.params.token, req.logContext)),
    ),
  );

  return router;
}
