import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { WeddingService } from "./Wedding.service";
import { WeddingValidator } from "./Wedding.validator";
import { getUser, handleException } from "../utils/requestUtils";

export function createWeddingGuestsRouter(svc: WeddingService): Router {
  const router = Router();

  router.get("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const guests = await svc.listGuests(getUser(req).username);
      return cr.ok(guests);
    } catch (err) {
      return handleException(err, cr, "WeddingGuestsController.GET /", "Failed to load guests");
    }
  });

  router.post("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const body = WeddingValidator.validateCreateGuestRequest(req);
      const guest = await svc.createGuest(getUser(req).username, body);
      return cr.ok(guest);
    } catch (err) {
      return handleException(err, cr, "WeddingGuestsController.POST /", "Failed to create guest");
    }
  });

  router.post("/update", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id, rsvp } = WeddingValidator.validateUpdateGuestRsvpRequest(req);
      const updated = await svc.updateGuestRsvp(getUser(req).username, id, rsvp);
      if (!updated) return cr.result(404, "Not Found", "Guest not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingGuestsController.POST /update", "Failed to update guest RSVP");
    }
  });

  router.post("/delete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = WeddingValidator.validateIdRequest(req);
      const deleted = await svc.deleteGuest(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Guest not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingGuestsController.POST /delete", "Failed to delete guest");
    }
  });

  return router;
}
