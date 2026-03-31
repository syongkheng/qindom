import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { WeddingService } from "./Wedding.service";
import { WeddingValidator } from "./Wedding.validator";
import { getUser, handleException } from "../utils/requestUtils";

export function createWeddingEventsRouter(svc: WeddingService): Router {
  const router = Router();

  router.get("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const events = await svc.listEvents(getUser(req).username);
      return cr.ok(events);
    } catch (err) {
      return handleException(err, cr, "WeddingEventsController.GET /", "Failed to load events");
    }
  });

  router.post("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const body = WeddingValidator.validateCreateEventRequest(req);
      const event = await svc.createEvent(getUser(req).username, body);
      return cr.ok(event);
    } catch (err) {
      return handleException(err, cr, "WeddingEventsController.POST /", "Failed to create event");
    }
  });

  router.post("/update", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id, status } = WeddingValidator.validateUpdateEventStatusRequest(req);
      const updated = await svc.updateEventStatus(getUser(req).username, id, status);
      if (!updated) return cr.result(404, "Not Found", "Event not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingEventsController.POST /update", "Failed to update event");
    }
  });

  router.post("/delete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = WeddingValidator.validateIdRequest(req);
      const deleted = await svc.deleteEvent(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Event not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingEventsController.POST /delete", "Failed to delete event");
    }
  });

  return router;
}
